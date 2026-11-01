from datetime import datetime

# ALERT RULES: compares a user's Git activity with the state of their task.
# "Pure" means it only uses its inputs and has no database calls, so it is easy to test.
def generate_alerts(user, behavior, task):
    """
    Generates alerts based on behavior signals and task state.
    This function is PURE and standalone.

    `behavior` is the behaviour engine's /behavior response. `task` carries
    `status` and `deadline_hours` (None when the task has no deadline).
    """

    alerts = []

    # 1. Inactivity alert
    if behavior["staleness"] > 12:
        alerts.append({
            "user": user,
            "type": "INACTIVITY",
            "severity": "HIGH",
            "reason": f"No Git activity in last {round(behavior['staleness'])} hours"
        })

    # 2. Deadline risk alert
    deadline_hours = task.get("deadline_hours")
    if deadline_hours is not None and deadline_hours < 24 and behavior["activity"] < 1:
        alerts.append({
            "user": user,
            "type": "DEADLINE_RISK",
            "severity": "HIGH",
            "reason": "Deadline approaching with low activity"
        })

    # 3. Progress mismatch alert
    if task["status"] == "in_progress" and behavior["mismatch"] == "HIGH_RISK":
        alerts.append({
            "user": user,
            "type": "PROGRESS_MISMATCH",
            "severity": "MEDIUM",
            "reason": "Task marked in-progress but Git shows inactivity"
        })

    return alerts


def _parse_time(value):
    return datetime.fromisoformat(value) if value else None


# Compares what someone said in chat with what Git shows: they made a promise, the
# grace period has passed, and no commit has arrived since. Returns None if all is well.
def broken_promise_alert(user, commitment, last_commit, now, grace_minutes):
    promised_at = _parse_time(commitment["created_at"])
    committed_at = _parse_time(last_commit)

    # A commit after the promise means they acted on it.
    if committed_at is not None and committed_at >= promised_at:
        return None

    minutes_since = (now - promised_at).total_seconds() / 60
    if minutes_since < grace_minutes:
        return None

    return {
        "user": user,
        "type": "BROKEN_PROMISE",
        "severity": "HIGH",
        "reason": f"Said \"{commitment['message']}\" {round(minutes_since)} min ago, with no commit since"
    }
