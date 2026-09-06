import os
from dotenv import load_dotenv

load_dotenv()

# Whether the key is configured, without printing the key itself — the previous
# debug line wrote the secret straight to stdout, so it landed in terminal
# scrollback and any captured logs.
print("OpenAI key loaded:", bool(os.getenv("OPENAI_API_KEY")))

from flask import Flask, jsonify, request
from services.code_analysis.code_score_engine import analyze_code_for_task
from flask_cors import CORS
from chat import chat_bp
from alert_engine import generate_alerts
from leaderboard import compute_leaderboard
from ai_features import bug_prediction_heatmap, auto_refactor

app = Flask(__name__)
CORS(app)

app.register_blueprint(chat_bp)

@app.route("/health")
def health():
    return {"status": "ok"}

@app.route("/alerts", methods=["POST"])
def alerts():
    data = request.json
    alerts = generate_alerts(data["user"], data["behavior"], data["task"])
    return jsonify(alerts)

@app.route("/leaderboard", methods=["POST"])
def leaderboard():
    leaderboard = compute_leaderboard(request.json)
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

# In-memory leaderboard store
_leaderboard_store = {}

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
    final_score = result.get("final_score", 0)

    # Update leaderboard store
    if user not in _leaderboard_store:
        _leaderboard_store[user] = {"submissions": 0, "best_score": 0, "total_score": 0}
    entry = _leaderboard_store[user]
    entry["submissions"] += 1
    entry["total_score"] += final_score
    entry["best_score"] = max(entry["best_score"], final_score)

    # Build leaderboard sorted by best score
    leaderboard = sorted(
        [{"user": u, "score": v["best_score"], "submissions": v["submissions"]} for u, v in _leaderboard_store.items()],
        key=lambda x: x["score"], reverse=True
    )
    user_rank = next((i + 1 for i, e in enumerate(leaderboard) if e["user"] == user), None)

    return jsonify({"analysis": result, "leaderboard": leaderboard, "user_rank": user_rank})
@app.route("/github-webhook", methods=["POST"])
def github_webhook():
    payload = request.json

    commits = payload.get("commits", [])

    for commit in commits:
        message = commit.get("message")
        author = commit.get("author", {}).get("name", "unknown")

        # For now simulate code content
        code = "print('commit detected')"

        task = {
            "title": message,
            "expected_outputs": ["implementation"]
        }

        result = analyze_code_for_task(task, code)

        print(f"Commit by {author} analyzed:", result)

    return jsonify({"status": "processed"})
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
    app.run(debug=True)
