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
