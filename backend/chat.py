# CHAT ROUTES: saves messages and adds the bot's automatic replies.
from flask import Blueprint, request, jsonify
from bot import classify_message, bot_reply
from db import get_db

# A Blueprint is a group of routes kept in its own file. app.py registers it.
chat_bp = Blueprint("chat", __name__)


# Saves one message and returns it in the format the frontend expects.
def _insert_message(user, text, msg_type):
    row = get_db().table("chat_messages").insert({
        "user_name": user,
        "body": text,
        "type": msg_type
    }).execute().data[0]
    return _to_api(row)


# Converts database column names (user_name, body) to API names (user, text).
def _to_api(row):
    return {
        "id": row["id"],
        "user": row["user_name"],
        "text": row["body"],
        "type": row["type"],
        "time": row["created_at"]
    }


@chat_bp.route("/chat/send", methods=["POST"])
def send():
    data = request.json
    user = data["user"]
    text = data["text"]

    # Label the message as vague, commitment or normal, then save it.
    # A nudge from the system quotes someone's promise, so it must not count as one.
    msg_type = "ai" if user == "SQUAD AI" else classify_message(text)
    msg = _insert_message(user, text, msg_type)

    # Keep each user's latest promise. user_name is the primary key, so a new
    # commitment replaces the old one.
    if msg_type == "commitment":
        get_db().table("commitments").upsert({
            "user_name": user,
            "message": text,
            "created_at": msg["time"]
        }).execute()

    # The bot's reply, if any, is saved as a normal chat message from AI_Bot.
    reply = bot_reply(msg_type)
    if reply:
        _insert_message("AI_Bot", reply, "ai")

    return jsonify(msg)

@chat_bp.route("/chat/messages")
def get_messages():
    rows = get_db().table("chat_messages").select("*").order("id").execute().data
    return jsonify([_to_api(row) for row in rows])

@chat_bp.route("/chat/commitments")
def commitments():
    rows = get_db().table("commitments").select("*").execute().data
    return jsonify({
        row["user_name"]: {"message": row["message"], "time": row["created_at"]}
        for row in rows
    })
