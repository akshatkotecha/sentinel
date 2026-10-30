import hashlib
import hmac
import os
import urllib.error
import urllib.parse
import urllib.request

from db import get_db


def signature_is_valid(body, signature):
    # Fails closed: the route is reachable by anyone who finds the URL, and it
    # writes to the database.
    secret = os.getenv("GITHUB_WEBHOOK_SECRET")
    if not secret or not signature:
        return False

    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def fetch_file(repo, path, sha):
    url = f"https://api.github.com/repos/{repo}/contents/{urllib.parse.quote(path)}?ref={sha}"
    headers = {"Accept": "application/vnd.github.raw+json", "User-Agent": "sentinel"}

    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        print(f"Could not fetch {path}@{sha}:", e)
        return None


def changed_python_files(commit):
    return [
        path for path in commit.get("added", []) + commit.get("modified", [])
        if path.endswith(".py")
    ]


def record_commit(user_id, name, commit):
    db = get_db()
    db.table("users").upsert({"id": user_id, "name": name}, ignore_duplicates=True).execute()

    rows = db.table("behavior").select("*").eq("user_id", user_id).execute().data
    current = rows[0] if rows else {"commits": 0, "file_edits_total": 0, "file_edits_reverts": 0}

    files_touched = len(commit.get("added", []) + commit.get("modified", []) + commit.get("removed", []))
    is_revert = commit.get("message", "").startswith("Revert")

    db.table("behavior").upsert({
        "user_id": user_id,
        "commits": current["commits"] + 1,
        "last_commit": commit.get("timestamp"),
        "file_edits_total": current["file_edits_total"] + files_touched,
        "file_edits_reverts": current["file_edits_reverts"] + (files_touched if is_revert else 0)
    }).execute()
