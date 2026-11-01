# HELPERS FOR THE GITHUB WEBHOOK: verifying requests, downloading changed files,
# and recording commits.
import hashlib
import hmac
import os
import urllib.error
import urllib.parse
import urllib.request

from db import get_db
from services.code_analysis.languages import language_for_path


def signature_is_valid(body, signature):
    # Fails closed: the route is reachable by anyone who finds the URL, and it
    # writes to the database.
    secret = os.getenv("GITHUB_WEBHOOK_SECRET")
    if not secret or not signature:
        return False

    # GitHub signs the request body with the shared secret. We repeat the calculation
    # and compare. If anyone changed the body or doesn't know the secret, they differ.
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    # compare_digest takes the same time wherever the strings differ, so an attacker
    # can't work out the signature by timing the responses.
    return hmac.compare_digest(expected, signature)


# Webhooks only list file names, so the code is downloaded from GitHub's API.
# `sha` gets the file exactly as it was in that commit. Returns None on failure.
def fetch_file(repo, path, sha):
    url = f"https://api.github.com/repos/{repo}/contents/{urllib.parse.quote(path)}?ref={sha}"
    headers = {"Accept": "application/vnd.github.raw+json", "User-Agent": "sentinel"}

    # Optional: a token allows access to private repos and a higher rate limit.
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=10) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        print(f"Could not fetch {path}@{sha}:", e)
        return None


# Only files in a supported language can be scored. Removed files have no code to read.
def changed_code_files(commit):
    return [
        path for path in commit.get("added", []) + commit.get("modified", [])
        if language_for_path(path)
    ]


# Adds one commit to the author's running totals in the behavior table.
def record_commit(user_id, name, commit):
    db = get_db()
    db.table("users").upsert({"id": user_id, "name": name}, ignore_duplicates=True).execute()

    # Read the current totals first, or start from zero for a new user.
    rows = db.table("behavior").select("*").eq("user_id", user_id).execute().data
    current = rows[0] if rows else {"commits": 0, "file_edits_total": 0, "file_edits_reverts": 0}

    files_touched = len(commit.get("added", []) + commit.get("modified", []) + commit.get("removed", []))
    # Git's default revert messages start with "Revert". These lower the accuracy metric.
    is_revert = commit.get("message", "").startswith("Revert")

    db.table("behavior").upsert({
        "user_id": user_id,
        "commits": current["commits"] + 1,
        "last_commit": commit.get("timestamp"),
        "file_edits_total": current["file_edits_total"] + files_touched,
        "file_edits_reverts": current["file_edits_reverts"] + (files_touched if is_revert else 0)
    }).execute()
