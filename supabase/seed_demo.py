"""Fills an empty database with sample data through the running services.

Everything goes through the real APIs, so assignments and scores are computed,
not typed in. Start all services first, then run: python supabase/seed_demo.py
"""

import json
import urllib.request
from datetime import datetime, timedelta, timezone

FLASK = "http://localhost:5001"
TASKS = "http://localhost:3000"
BEHAVIOUR = "http://localhost:3002"

USERS = [
    {"id": "aditi", "name": "Aditi", "role": "Frontend", "skills": ["frontend", "react"]},
    {"id": "rahul", "name": "Rahul", "role": "Backend", "skills": ["backend", "node"]},
    {"id": "neha", "name": "Neha", "role": "AI Eng", "skills": ["ml", "python"]},
]

# (title, status)
SAMPLE_TASKS = [
    ("Fix auth API redirect", "in_progress"),
    ("Polish dashboard animation", "todo"),
    ("Train risk model on commit data", "in_progress"),
    ("Add database connection retries", "done"),
    ("Build react settings page", "done"),
]

# (user id, commits, total file edits, reverts, hours since last commit)
ACTIVITY = [
    ("rahul", 18, 40, 2, 1),
    ("aditi", 11, 26, 1, 3),
    ("neha", 6, 15, 3, 14),
]

MESSAGES = [
    ("Rahul", "I will finish the auth redirect by tomorrow"),
    ("Aditi", "Dashboard animation is almost there"),
    ("Neha", "Model training run done by EOD"),
]

SUBMISSIONS = [
    (
        "Rahul",
        "Fix auth API redirect",
        "def login(username, password):\n    return create_session(username)\n\n"
        "def create_session(user_id):\n    return {'user': user_id}\n\n"
        "def redirect_after_login(session):\n    return '/home' if session else '/login'\n\n"
        "def test_redirect_after_login():\n    assert redirect_after_login({'user': 'a'}) == '/home'\n",
    ),
    (
        "Neha",
        "Train risk model on commit data",
        "def load_commit_features(path):\n    return open(path).read()\n\n"
        "def train_risk_model(features):\n    return {'weights': features}\n",
    ),
    (
        "Aditi",
        "Add two numbers",
        "def parse_csv(path):\n    return open(path).read()\n",
    ),
]


def send(method, url, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"} if data else {}
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def main():
    for user in USERS:
        send("POST", f"{TASKS}/users/create", user)

    for title, status in SAMPLE_TASKS:
        task = send("POST", f"{TASKS}/tasks/create", {"title": title})
        assigned = send("POST", f"{TASKS}/tasks/assign", {"taskId": task["id"]})
        if status != "todo":
            send("PATCH", f"{TASKS}/tasks/{task['id']}", {"status": status})
        print(f"task: {title} -> {assigned['task']['assignee']} ({status})")

    now = datetime.now(timezone.utc)
    for user_id, commits, total, reverts, hours in ACTIVITY:
        send("POST", f"{BEHAVIOUR}/git/update/{user_id}", {
            "commits": commits,
            "fileEdits": {"total": total, "reverts": reverts},
            "timestamps": [(now - timedelta(hours=hours)).isoformat()],
        })

    for user, text in MESSAGES:
        send("POST", f"{FLASK}/chat/send", {"user": user, "text": text})

    for user, title, code in SUBMISSIONS:
        result = send("POST", f"{FLASK}/analyze-and-rank", {"user": user, "title": title, "code": code})
        print(f"score: {user} / {title} = {result['analysis']['final_score']}")


if __name__ == "__main__":
    main()
