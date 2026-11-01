# Sends signed fake GitHub pushes to the real route. The database, GitHub download and
# scoring are replaced, so this tests the webhook's own logic and writes nothing.
import hashlib
import hmac
import json
from unittest.mock import MagicMock, patch

import pytest

import app as flask_app
import github_events
from github_events import changed_code_files

SECRET = "test-secret"
COMMIT = {
    "id": "abc123",
    "message": "Fix alerts",
    "timestamp": "2026-11-01T10:00:00+05:30",
    "author": {"name": "Test Dev", "username": "testdev"},
    "added": ["alerts.py", "README.md"],
    "modified": ["src/App.tsx"],
    "removed": [],
}
BODY = json.dumps({"repository": {"full_name": "a/b"}, "commits": [COMMIT]}).encode()


def sign(body, key=SECRET):
    return "sha256=" + hmac.new(key.encode(), body, hashlib.sha256).hexdigest()


def post(body, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Hub-Signature-256"] = signature
    return flask_app.app.test_client().post("/github-webhook", data=body, headers=headers)


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", SECRET)
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    with patch.object(github_events, "get_db", return_value=fake):
        yield fake


@pytest.mark.parametrize("signature", [None, sign(BODY, "wrong-key")])
def test_bad_signature_is_rejected_and_writes_nothing(db, signature):
    assert post(BODY, signature).status_code == 403
    db.table.assert_not_called()


def test_changed_body_is_rejected(db):
    assert post(BODY + b" ", sign(BODY)).status_code == 403


def test_missing_server_secret_rejects_everything(monkeypatch):
    monkeypatch.delenv("GITHUB_WEBHOOK_SECRET", raising=False)
    assert post(BODY, sign(BODY)).status_code == 403


def test_valid_push_records_commit_and_scores_code_files(db):
    analyze = MagicMock(return_value={"final_score": 80})
    with patch.object(flask_app, "fetch_file", return_value="code"), \
            patch.object(flask_app, "analyze_code_for_task", analyze), \
            patch.object(flask_app, "_save_submission") as save:
        response = post(BODY, sign(BODY))

    assert response.status_code == 200
    assert response.get_json()["files_scored"] == 2
    assert [call.args[2] for call in analyze.call_args_list] == ["python", "typescript"]
    assert save.call_count == 2

    row = db.table.return_value.upsert.call_args_list[-1].args[0]
    assert row["user_id"] == "testdev"
    assert row["commits"] == 1
    assert row["file_edits_total"] == 3


def test_github_ping_is_accepted(db):
    ping = json.dumps({"zen": "hi"}).encode()
    assert post(ping, sign(ping)).status_code == 200


def test_only_supported_files_are_scored():
    assert changed_code_files(COMMIT) == ["alerts.py", "src/App.tsx"]
