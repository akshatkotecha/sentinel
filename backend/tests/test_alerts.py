# Checks the alert rules. These are pure functions, so no database or server is needed.
from datetime import datetime, timedelta, timezone

from alert_engine import broken_promise_alert, generate_alerts

NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def ago(**time):
    return (NOW - timedelta(**time)).isoformat()


def promise(**time):
    return {"message": "I will finish by tomorrow", "created_at": ago(**time)}


def behavior(staleness=0, activity=5, mismatch="OK"):
    return {"staleness": staleness, "activity": activity, "mismatch": mismatch}


def alert_types(*args):
    return [alert["type"] for alert in generate_alerts("Neha", *args)]


def test_no_alerts_when_all_is_well():
    assert alert_types(behavior(), {"status": "todo", "deadline_hours": None}) == []


def test_inactivity_after_12_hours():
    assert "INACTIVITY" in alert_types(behavior(staleness=13), {"status": "todo"})
    assert "INACTIVITY" not in alert_types(behavior(staleness=12), {"status": "todo"})


def test_deadline_risk_needs_close_deadline_and_low_activity():
    assert "DEADLINE_RISK" in alert_types(behavior(activity=0), {"status": "todo", "deadline_hours": 5})
    assert "DEADLINE_RISK" not in alert_types(behavior(activity=2), {"status": "todo", "deadline_hours": 5})


def test_progress_mismatch_only_when_in_progress():
    assert "PROGRESS_MISMATCH" in alert_types(behavior(mismatch="HIGH_RISK"), {"status": "in_progress"})
    assert "PROGRESS_MISMATCH" not in alert_types(behavior(mismatch="HIGH_RISK"), {"status": "todo"})


def test_promise_with_no_commit_after_grace_is_broken():
    alert = broken_promise_alert("Neha", promise(minutes=5), ago(hours=1), NOW, grace_minutes=1)
    assert alert["type"] == "BROKEN_PROMISE"
    assert "I will finish by tomorrow" in alert["reason"]


def test_promise_within_grace_is_not_broken_yet():
    assert broken_promise_alert("Neha", promise(minutes=5), ago(hours=1), NOW, grace_minutes=60) is None


def test_commit_after_promise_clears_it():
    assert broken_promise_alert("Neha", promise(minutes=5), ago(minutes=1), NOW, grace_minutes=1) is None


def test_someone_who_never_committed_can_break_a_promise():
    assert broken_promise_alert("Neha", promise(minutes=5), None, NOW, grace_minutes=1) is not None
