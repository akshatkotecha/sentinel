# FLASK BACKEND (port 5001)
# Entry point for the Python service: code analysis, chat, live alerts and the
# GitHub webhook. Each @app.route below connects a URL to a Python function.
import os
from dotenv import load_dotenv

# Loads the values in .env so os.getenv can read them.
load_dotenv()

# Whether the key is configured, without printing the key itself — a value
# would land in terminal scrollback and any captured logs.
print("Groq key loaded:", bool(os.getenv("GROQ_API_KEY")))

print("Supabase configured:", bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SECRET_KEY")))

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from services.code_analysis.code_score_engine import analyze_code_for_task
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from chat import chat_bp
from alert_engine import generate_alerts, broken_promise_alert
from leaderboard import compute_leaderboard
from ai_features import bug_prediction_heatmap, auto_refactor
from db import get_db
from github_events import signature_is_valid, fetch_file, changed_code_files, record_commit
from services.code_analysis.languages import UnsupportedLanguage, language_for_path

# Where Flask finds the Express behaviour engine it needs for alerts.
BEHAVIOUR_URL = os.getenv("BEHAVIOUR_URL", "http://localhost:3002")

# Create the app. CORS lets the React page on port 5173 call this port.
app = Flask(__name__)
CORS(app)

# Adds the /chat/... routes, which are defined in chat.py.
app.register_blueprint(chat_bp)

# Code in a language we can't read is the user's mistake, so it gets a clear 400.
@app.errorhandler(UnsupportedLanguage)
def handle_unsupported_language(e):
    return jsonify({"error": str(e)}), 400

# Without this, debug mode answers a crash with a page that has no CORS headers,
# so the browser reports a CORS error instead of the real failure.
@app.errorhandler(Exception)
def handle_error(e):
    if isinstance(e, HTTPException):
        return e

    app.logger.exception(e)
    return jsonify({"error": str(e)}), 500

# Quick way to check that the server is up.
@app.route("/health")
def health():
    return {"status": "ok"}

# Generates alerts from data sent in the request. The dashboard uses /alerts/live.
@app.route("/alerts", methods=["POST"])
def alerts():
    data = request.json
    alerts = generate_alerts(data["user"], data["behavior"], data["task"])
    return jsonify(alerts)

# Asks the Express behaviour engine for one user's metrics. This is how the two
# backends talk to each other: an ordinary HTTP request.
def _fetch_behavior(user_id, status):
    url = f"{BEHAVIOUR_URL}/behavior/{user_id}?taskStatus={status}"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        # 404 means no Git activity recorded yet, so there's nothing to judge.
        if e.code == 404:
            return None
        raise

# The dashboard polls this. It checks every unfinished, assigned task against its
# assignee's Git activity and returns the problems it finds.
@app.route("/alerts/live")
def live_alerts():
    db = get_db()
    tasks = db.table("tasks").select("*").neq("status", "done").not_.is_("assigned_to", "null").execute().data
    names = {u["id"]: u["name"] for u in db.table("users").select("id, name").execute().data}

    # Keyed by (user, alert type), so a user with three stale tasks gets one
    # INACTIVITY alert instead of three.
    found = {}
    try:
        for task in tasks:
            behavior = _fetch_behavior(task["assigned_to"], task["status"])
            if behavior is None:
                continue

            # Hours left until the deadline, or None if the task has no deadline.
            deadline_hours = None
            if task["deadline"]:
                deadline = datetime.fromisoformat(task["deadline"])
                deadline_hours = (deadline - datetime.now(timezone.utc)).total_seconds() / 3600

            name = names.get(task["assigned_to"], task["assigned_to"])
            state = {"status": task["status"], "deadline_hours": deadline_hours}
            for alert in generate_alerts(name, behavior, state):
                found[(alert["user"], alert["type"])] = alert
    # 503 = this server is fine, but a service it depends on is down.
    except urllib.error.URLError as e:
        return jsonify({"error": f"Behaviour engine unreachable: {e}"}), 503

    for alert in _broken_promises(db):
        found[(alert["user"], alert["type"])] = alert

    return jsonify(list(found.values()))

# Checks each promise made in chat against that person's last commit. Promises are
# stored by display name, so bots and unknown names are skipped.
def _broken_promises(db):
    grace_minutes = float(os.getenv("PROMISE_GRACE_MINUTES", 1440))
    users = db.table("users").select("id, name, behavior(last_commit)").execute().data
    last_commits = {u["name"]: (u["behavior"] or {}).get("last_commit") for u in users}
    now = datetime.now(timezone.utc)

    alerts = []
    for commitment in db.table("commitments").select("*").execute().data:
        name = commitment["user_name"]
        if name in last_commits:
            alert = broken_promise_alert(name, commitment, last_commits[name], now, grace_minutes)
            if alert:
                alerts.append(alert)
    return alerts

# Not used by the dashboard, which reads the leaderboard view in the database.
@app.route("/leaderboard", methods=["POST"])
def leaderboard():
    data = request.json
    if "users_behavior" not in data or "users_code_score" not in data:
        return jsonify({"error": "users_behavior and users_code_score are required"}), 400

    leaderboard = compute_leaderboard(data["users_behavior"], data["users_code_score"])
    return jsonify(leaderboard)

# Scores code without saving anything.
@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json

    code = data.get("code")
    task = {
        "title": data.get("title"),
        "expected_outputs": data.get("expected_outputs", [])
    }

    result = analyze_code_for_task(task, code, data.get("language"))

    return jsonify(result)

# Saves the score and code summary, never the code itself. `source` records where
# the submission came from: "console" or "github".
def _save_submission(user, title, result, source):
    get_db().table("submissions").insert({
        "user_name": user,
        "title": title,
        "final_score": result["final_score"],
        "syntax_ok": result["syntax_ok"],
        "quality": result["quality"],
        "summary": result["summary"],
        "llm_result": result["llm_result"],
        "source": source
    }).execute()

# Used by the Code Analyser screen: score the code, save it, return the new rankings.
@app.route("/analyze-and-rank", methods=["POST"])
def analyze_and_rank():
    data = request.json
    user = data.get("user", "Anonymous")
    code = data.get("code")
    if not code:
        return jsonify({"error": "No code provided"}), 400

    task = {
        "title": data.get("title", "Untitled"),
        "expected_outputs": data.get("expected_outputs", [])
    }

    result = analyze_code_for_task(task, code, data.get("language"))
    _save_submission(user, task["title"], result, "console")

    # The leaderboard is a database view, calculated from submissions on every read.
    leaderboard = get_db().table("leaderboard").select("*").execute().data
    # Position of this user in the sorted list, counting from 1.
    user_rank = next((i + 1 for i, e in enumerate(leaderboard) if e["user"] == user), None)

    return jsonify({"analysis": result, "leaderboard": leaderboard, "user_rank": user_rank})
# GitHub calls this URL after a push. The signature proves GitHub really sent it.
# request.get_data() is used because the check needs the exact bytes received.
@app.route("/github-webhook", methods=["POST"])
def github_webhook():
    if not signature_is_valid(request.get_data(), request.headers.get("X-Hub-Signature-256")):
        return jsonify({"error": "Invalid signature"}), 403

    payload = request.json

    commits = payload.get("commits", [])
    repo = payload.get("repository", {}).get("full_name")
    scored = 0

    # Each commit updates the author's activity, then each code file it changed
    # is scored. The commit message is used as the task title.
    for commit in commits:
        message = commit.get("message")
        author = commit.get("author", {})
        name = author.get("name", "unknown")

        record_commit(author.get("username") or name, name, commit)

        task = {
            "title": message,
            "expected_outputs": ["implementation"]
        }

        for path in changed_code_files(commit):
            code = fetch_file(repo, path, commit["id"])
            if code is None:
                continue

            result = analyze_code_for_task(task, code, language_for_path(path))
            _save_submission(name, f"{message} ({path})", result, "github")
            scored += 1

    return jsonify({"status": "processed", "commits": len(commits), "files_scored": scored})
# API only, not shown in the dashboard. Rates each function's complexity.
@app.route('/bug-heatmap', methods=['POST'])
def bug_heatmap():

    data = request.json
    code = data.get("code")

    result = bug_prediction_heatmap(code)

    return jsonify(result)
# API only, not shown in the dashboard. Rewrites simple loops.
@app.route('/auto-refactor', methods=['POST'])
def auto_refactor_code():

    data = request.json
    code = data.get("code")

    result = auto_refactor(code)

    return jsonify(result)



# Runs only when this file is started directly: python app.py.
# debug=True restarts the server when code changes. It is for development only.
if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5001)))
