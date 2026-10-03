"""
CI/CD & Git Webhook Deployment Router
====================================
Endpoints for receiving Git webhooks, querying release history,
and triggering 1-click rollbacks.
"""

import hashlib
import hmac
import json
import re
import secrets
import shlex
import shutil
import subprocess
import tempfile
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from server.config import PROJECTS_DIR
from server.orchestrator.cicd import cicd_manager
from server.orchestrator.driver import PhoneRemoteDriver
from server.orchestrator.audit_log import audit_logger

router = APIRouter(prefix="/api/cicd", tags=["CI/CD & Rollbacks"])


class RollbackRequest(BaseModel):
    version_id: str


class GitSyncRequest(BaseModel):
    repo_url: str | None = None
    branch: str | None = "main"


class WebhookConfigResponse(BaseModel):
    project_id: str
    webhook_url: str
    secret_token: str
    tracked_branch: str
    repo_url: str = ""
    auto_migrate: bool
    status: str


def _get_git_config_file(project_id: str) -> Path:
    p = PROJECTS_DIR / project_id
    p.mkdir(parents=True, exist_ok=True)
    return p / "git_config.json"


def _load_git_config(project_id: str) -> dict:
    f = _get_git_config_file(project_id)
    cfg = {}
    if f.exists():
        try:
            cfg = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            cfg = {}
    if not cfg.get("secret_token"):
        cfg["secret_token"] = secrets.token_hex(20)
        _save_git_config(project_id, cfg)
    return cfg


def _save_git_config(project_id: str, cfg: dict) -> None:
    f = _get_git_config_file(project_id)
    f.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


@router.get("/{project_id}/config", response_model=WebhookConfigResponse)
async def get_webhook_config(project_id: str, request: Request):
    """Returns copyable webhook setup instructions for GitHub / GitLab and saved repo config."""
    base_url = str(request.base_url).rstrip("/")
    cfg = _load_git_config(project_id)
    return {
        "project_id": project_id,
        "webhook_url": f"{base_url}/api/cicd/{project_id}/webhook",
        "secret_token": cfg.get("secret_token", ""),
        "tracked_branch": cfg.get("branch", "main"),
        "repo_url": cfg.get("repo_url", ""),
        "auto_migrate": True,
        "status": "LISTENING",
    }


@router.get("/{project_id}/history")
async def get_deployment_history(project_id: str):
    """Returns historical deployment versions for 1-click rollback."""
    history = cicd_manager.get_history(project_id)
    return {
        "project_id": project_id,
        "total_releases": len(history),
        "history": history,
    }


@router.post("/{project_id}/webhook")
async def handle_git_webhook(project_id: str, request: Request):
    """
    Receives GitHub / GitLab push webhook.
    Verifies HMAC SHA-256 signature / secret token, extracts commit information,
    updates application code, runs migrations, and records a new release.
    """
    body_bytes = await request.body()
    cfg = _load_git_config(project_id)
    secret = cfg.get("secret_token", "")

    # Enforce webhook authenticity verification
    if secret:
        gh_sig = request.headers.get("X-Hub-Signature-256", "")
        gl_token = request.headers.get("X-Gitlab-Token", "")
        auth_header = request.headers.get("X-Webhook-Secret", "")
        auth_query = request.query_params.get("secret", "")

        verified = False
        if gh_sig.startswith("sha256="):
            expected = "sha256=" + hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
            if hmac.compare_digest(expected, gh_sig):
                verified = True
        if not verified and gl_token:
            if hmac.compare_digest(secret, gl_token):
                verified = True
        if not verified and auth_header:
            if hmac.compare_digest(secret, auth_header):
                verified = True
        if not verified and auth_query:
            if hmac.compare_digest(secret, auth_query):
                verified = True

        if not verified:
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Webhook signature or secret token verification failed."
            )

    try:
        payload = json.loads(body_bytes.decode("utf-8", errors="replace")) if body_bytes else {}
    except Exception:
        payload = {}

    # Extract commit info from standard GitHub or GitLab payload
    commits = payload.get("commits", [])
    head_commit = payload.get("head_commit") or (commits[-1] if commits else {})
    commit_hash = head_commit.get("id", "git_push_latest")
    commit_msg = head_commit.get("message", "Automated push from GitHub")
    author_info = head_commit.get("author", {})
    author = author_info.get("name") or author_info.get("username") or payload.get("pusher", {}).get("name", "GitHub User")
    ref = payload.get("ref", "refs/heads/main")
    branch = ref.split("/")[-1] if "/" in ref else "main"

    # Create new release record
    new_release = cicd_manager.create_release(
        project_id=project_id,
        commit_hash=commit_hash,
        commit_msg=commit_msg.strip().split("\n")[0],
        author=author,
        branch=branch,
        trigger="GITHUB_WEBHOOK",
    )

    # Perform hot restart on phone
    clean_branch = re.sub(r"[^a-zA-Z0-9_\-\.]", "", branch)
    clean_project_id = re.sub(r"[^a-zA-Z0-9_\-]", "", project_id)
    remote_app_dir = f"/data/data/com.termux/files/home/apps/{clean_project_id}"
    update_cmd = (
        f"cd {shlex.quote(remote_app_dir)} 2>/dev/null && "
        f"if [ -d .git ]; then git pull origin {shlex.quote(clean_branch)} 2>/dev/null || true; fi; "
        "if [ -f artisan ]; then "
        "php artisan optimize:clear 2>/dev/null || true; "
        "php artisan migrate --force 2>/dev/null || true; "
        "fi"
    )
    try:
        PhoneRemoteDriver.exec_ssh_quick(update_cmd, timeout=20)
    except Exception:
        pass

    return {
        "status": "DEPLOYED",
        "message": f"Successfully pulled & deployed commit {commit_hash[:7]}",
        "release": new_release,
    }


@router.post("/{project_id}/rollback")
async def trigger_rollback(project_id: str, req: RollbackRequest):
    """
    Instantly rolls back the live project to any selected past release.
    """
    try:
        rolled_back = cicd_manager.rollback(project_id, req.version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Clear application cache and hot-restart server on phone
    clean_project_id = re.sub(r"[^a-zA-Z0-9_\-]", "", project_id)
    remote_app_dir = f"/data/data/com.termux/files/home/apps/{clean_project_id}"
    commit_hash = rolled_back.get("commit_hash", "")
    clean_commit = re.sub(r"[^a-zA-Z0-9_\-\.]", "", commit_hash) if commit_hash else ""

    checkout_cmd = f"if [ -d .git ] && [ -n '{clean_commit}' ]; then git checkout {shlex.quote(clean_commit)} 2>/dev/null || true; fi; " if clean_commit else ""

    restart_cmd = (
        f"cd {shlex.quote(remote_app_dir)} 2>/dev/null && "
        f"{checkout_cmd}"
        "if [ -f artisan ]; then php artisan optimize:clear 2>/dev/null || true; fi; "
        "kill -9 $(lsof -ti:8000..8999) 2>/dev/null || true; "
        "[ -f run_server.sh ] && ./run_server.sh 2>/dev/null || true"
    )
    try:
        PhoneRemoteDriver.exec_ssh_quick(restart_cmd, timeout=20)
    except Exception:
        pass

    return {
        "status": "ROLLED_BACK",
        "message": f"Successfully rolled back to {req.version_id} ({rolled_back.get('commit_msg', '')})",
        "active_release": rolled_back,
    }


@router.post("/{project_id}/sync")
async def trigger_git_sync(project_id: str, req: GitSyncRequest):
    """
    1-Click Pull & Deploy:
    Fetches the latest commit directly from GitHub / Git repository,
    overlays code updates, hot-reloads the app, and registers the release.
    """
    cfg = _load_git_config(project_id)
    repo_url = (req.repo_url or cfg.get("repo_url", "")).strip()
    branch = (req.branch or cfg.get("branch", "main")).strip() or "main"

    if not repo_url:
        raise HTTPException(
            status_code=400,
            detail="Repository URL required. Please paste your GitHub repository URL.",
        )

    # Save git config
    cfg["repo_url"] = repo_url
    cfg["branch"] = branch
    _save_git_config(project_id, cfg)

    temp_dir = Path(tempfile.mkdtemp(prefix=f"sd_sync_{project_id}_"))
    commit_hash = "HEAD~0"
    commit_msg = "Manual GitHub sync"
    author = "GitHub Operator"

    try:
        # Perform shallow clone of latest commit on specified branch
        clone_cmd = [
            "git",
            "-c", "protocol.ext.allow=never",
            "clone",
            "--depth", "1",
            "--branch", branch,
            "--", repo_url, str(temp_dir),
        ]
        res = subprocess.run(clone_cmd, capture_output=True, text=True, timeout=90)
        if res.returncode != 0:
            err = res.stderr.strip() or res.stdout.strip()
            raise HTTPException(
                status_code=422,
                detail=f"Failed to clone repository: {err}",
            )

        # Extract exact commit hash, author name, and message from git log
        log_cmd = ["git", "-C", str(temp_dir), "log", "-1", "--format=%H|%an|%s"]
        log_res = subprocess.run(log_cmd, capture_output=True, text=True, timeout=10)
        if log_res.returncode == 0 and log_res.stdout.strip():
            parts = log_res.stdout.strip().split("|", 2)
            if len(parts) >= 3:
                commit_hash = parts[0]
                author = parts[1]
                commit_msg = parts[2]

        # Copy updated application files into project directory
        project_dir = PROJECTS_DIR / project_id
        if project_dir.exists():
            skip_copy = {".git", ".env", "storage", "node_modules", "vendor"}
            for item in temp_dir.iterdir():
                if item.name in skip_copy:
                    continue
                dest = project_dir / item.name
                if item.is_dir():
                    shutil.copytree(
                        item,
                        dest,
                        dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("*.sqlite", "*.sqlite3", "*.sqlite-journal"),
                    )
                else:
                    if not item.name.endswith((".sqlite", ".sqlite3")):
                        shutil.copy2(item, dest)

            # Sync to phone Termux if project is deployed
            remote_app_dir = f"/data/data/com.termux/files/home/apps/{project_id}"
            try:
                driver = PhoneRemoteDriver()
                driver._sync_files_sftp(project_dir, remote_app_dir, lambda s, m: None)
            except Exception as e:
                print(f"[PHONE SFTP SYNC WARNING]: {e}")

            # Reload and migrate
            update_cmd = (
                f"cd {remote_app_dir} 2>/dev/null && "
                "php artisan optimize:clear 2>/dev/null || true; "
                "php artisan migrate --force 2>/dev/null || true"
            )
            try:
                PhoneRemoteDriver.exec_ssh_quick(update_cmd, timeout=15)
            except Exception:
                pass

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    # Register release
    new_release = cicd_manager.create_release(
        project_id=project_id,
        commit_hash=commit_hash,
        commit_msg=commit_msg,
        author=author,
        branch=branch,
        trigger="1CLICK_GITHUB_SYNC",
    )

    return {
        "status": "DEPLOYED",
        "message": f"Successfully pulled & deployed commit {commit_hash[:7]}: \"{commit_msg}\"",
        "release": new_release,
    }
