# CHAT BOT: simple keyword rules, with no LLM involved.
vague_words = [
    "almost", "soon", "trying", "working",
    "maybe", "nearly"
]

commitment_words = [
    "today", "by eod", "tonight",
    "tomorrow", "will finish", "done by"
]

# Vague words are checked first, so "almost done by eod" counts as vague.
def classify_message(text):
    t = text.lower()
    for w in vague_words:
        if w in t:
            return "vague"
    for w in commitment_words:
        if w in t:
            return "commitment"
    return "normal"

# Returns the bot's reply, or None if it should stay quiet.
def bot_reply(msg_type):
    if msg_type == "vague":
        return "🤖 That sounds unclear. Any blockers or ETA?"
    if msg_type == "commitment":
        return "🤖 Noted 👍 I’ll check if progress stalls."
    return None
