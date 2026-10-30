import os
from dotenv import load_dotenv

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
from alert_engine import generate_alerts
from leaderboard import compute_leaderboard
from ai_features import bug_prediction_heatmap, auto_refactor
from db import get_db
from github_events import signature_is_valid, fetch_file, changed_python_files, record_commit

BEHAVIOUR_URL = os.getenv("BEHAVIOUR_URL", "http://localhost:3002")

app = Flask(__name__)
CORS(app)

app.register_blueprint(chat_bp)

# Without this, debug mode answers a crash with a page that has no CORS headers,
# so the browser reports a CORS error instead of the real failure.
@app.errorhandler(Exception)
def handle_error(e):
    if isinstance(e, HTTPException):
        return e

    app.logger.exception(e)
    return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return {"status": "ok"}

@app.route("/alerts", methods=["POST"])
def alerts():
    data = request.json
    alerts = generate_alerts(data["user"], data["behavior"], data["task"])
    return jsonify(alerts)

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

@app.route("/alerts/live")
def live_alerts():
    db = get_db()
    tasks = db.table("tasks").select("*").neq("status", "done").not_.is_("assigned_to", "null").execute().data
    names = {u["id"]: u["name"] for u in db.table("users").select("id, name").execute().data}

    found = {}
    try:
        for task in tasks:
            behavior = _fetch_behavior(task["assigned_to"], task["status"])
            if behavior is None:
                continue

            deadline_hours = None
            if task["deadline"]:
                deadline = datetime.fromisoformat(task["deadline"])
                deadline_hours = (deadline - datetime.now(timezone.utc)).total_seconds() / 3600

            name = names.get(task["assigned_to"], task["assigned_to"])
            state = {"status": task["status"], "deadline_hours": deadline_hours}
            for alert in generate_alerts(name, behavior, state):
                found[(alert["user"], alert["type"])] = alert
    except urllib.error.URLError as e:
        return jsonify({"error": f"Behaviour engine unreachable: {e}"}), 503

    return jsonify(list(found.values()))

@app.route("/leaderboard", methods=["POST"])
def leaderboard():
    data = request.json
    if "users_behavior" not in data or "users_code_score" not in data:
        return jsonify({"error": "users_behavior and users_code_score are required"}), 400

    leaderboard = compute_leaderboard(data["users_behavior"], data["users_code_score"])
    return jsonify(leaderboard)

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.json

    code = data.get("code")
    task = {
        "title": data.get("title"),
        "expected_outputs": data.get("expected_outputs", [])
    }

    result = analyze_code_for_task(task, code)

    return jsonify(result)

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

    result = analyze_code_for_task(task, code)
    _save_submission(user, task["title"], result, "console")

    leaderboard = get_db().table("leaderboard").select("*").execute().data
    user_rank = next((i + 1 for i, e in enumerate(leaderboard) if e["user"] == user), None)

    return jsonify({"analysis": result, "leaderboard": leaderboard, "user_rank": user_rank})
@app.route("/github-webhook", methods=["POST"])
def github_webhook():
    if not signature_is_valid(request.get_data(), request.headers.get("X-Hub-Signature-256")):
        return jsonify({"error": "Invalid signature"}), 403

    payload = request.json

    commits = payload.get("commits", [])
    repo = payload.get("repository", {}).get("full_name")
    scored = 0

    for commit in commits:
        message = commit.get("message")
        author = commit.get("author", {})
        name = author.get("name", "unknown")

        record_commit(author.get("username") or name, name, commit)

        task = {
            "title": message,
            "expected_outputs": ["implementation"]
        }

        for path in changed_python_files(commit):
            code = fetch_file(repo, path, commit["id"])
            if code is None:
                continue

            result = analyze_code_for_task(task, code)
            _save_submission(name, f"{message} ({path})", result, "github")
            scored += 1

    return jsonify({"status": "processed", "commits": len(commits), "files_scored": scored})
@app.route('/bug-heatmap', methods=['POST'])
def bug_heatmap():

    data = request.json
    code = data.get("code")

    result = bug_prediction_heatmap(code)

    return jsonify(result)
@app.route('/auto-refactor', methods=['POST'])
def auto_refactor_code():

    data = request.json
    code = data.get("code")

    result = auto_refactor(code)

    return jsonify(result)



if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5001)))
