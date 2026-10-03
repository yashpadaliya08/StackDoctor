"""
GitHub Quick-Deploy Route
=========================
One-shot API: paste GitHub URL → clone → auto-fix → deploy → stream live terminal.

POST /api/github-deploy
{
    "repo_url": "https://github.com/user/my-laravel-app",
    "branch": "main",           // optional, auto-detected from URL
    "db_name": "my_app_db",     // optional, auto-generated if omitted
    "db_user": "root",          // optional, defaults to "root"
    "db_password": "",          // optional, defaults to empty
    "run_seeder": false,        // optional, run php artisan db:seed after migrate
    "seeder_class": null,       // optional, specific seeder class name
    "target": "phone"           // "phone" | "local"
}

Returns: same shape as /api/deploy for SSE stream compatibility.
"""

import asyncio
import secrets
import shutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from doctor.engine import DoctorEngine
from doctor.ingestion.git_cloner import GitCloneError, SafeGitCloner
from server.config import PROJECTS_DIR
from server.orchestrator.pipeline import orchestrator


router = APIRouter(prefix="/api/github-deploy", tags=["GitHub Deploy"])
doctor = DoctorEngine()


class GitHubDeployRequest(BaseModel):
    repo_url: str
    branch: str | None = None
    db_name: str | None = None
    db_user: str = "root"
    db_password: str = ""
    run_seeder: bool = False
    seeder_class: str | None = None
    target: str = "phone"
    subdomain: str | None = None
    env_vars: dict[str, str] | None = None


class GitHubDeployResponse(BaseModel):
    deployment_id: str
    project_id: str
    subdomain: str
    status: str
    repo_url: str
    target: str


@router.post("", response_model=GitHubDeployResponse)
async def github_quick_deploy(req: GitHubDeployRequest) -> GitHubDeployResponse:
    """
    One-click pipeline: clone GitHub repo → auto-apply Doctor fixes → deploy.
    Stream progress via /api/deploy/{deployment_id}/stream (standard SSE endpoint).
    """
    # 1. Validate URL
    if not SafeGitCloner.is_valid_git_url(req.repo_url):
        raise HTTPException(
            status_code=400,
            detail="Invalid Git repository URL. Paste a GitHub, GitLab, or Bitbucket URL.",
        )

    # 2. Normalize URL + resolve branch
    clone_url, url_branch = SafeGitCloner.normalize_git_url(req.repo_url)
    effective_branch = req.branch or url_branch

    # 3. Allocate project ID + paths
    project_id = secrets.token_hex(6)
    project_dir = PROJECTS_DIR / project_id

    # 4. Clone repository
    try:
        SafeGitCloner.clone(clone_url, project_dir, branch=effective_branch)
    except GitCloneError as e:
        shutil.rmtree(project_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=f"Repository clone failed: {str(e)}")
    except Exception as e:
        shutil.rmtree(project_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Unexpected error during clone: {str(e)}")

    # 5. Run Doctor analysis + auto-apply all fixable issues silently
    try:
        report = doctor.analyze(project_dir)
        if report.auto_fixable_count > 0:
                doctor.apply_fixes(project_dir, generate_docker=True)
    except Exception:
        pass  # Non-fatal: proceed to deploy even if analysis fails

    # 6. Build subdomain from repo name
    repo_name = clone_url.rstrip("/").split("/")[-1].replace(".git", "").lower()
    repo_name = "".join(c for c in repo_name if c.isalnum() or c == "-")[:20]
    subdomain = req.subdomain or f"gh-{repo_name}-{project_id[:4]}"
    subdomain = "".join(c for c in subdomain.lower() if c.isalnum() or c == "-")

    target = req.target or "phone"
    deployment_id = secrets.token_hex(6)

    # 7. Build and sanitize MySQL env_overrides & custom env from user config
    from server.utils.validators import sanitize_db_overrides, sanitize_env_vars

    db_overrides = sanitize_db_overrides(
        db_name=req.db_name,
        db_user=req.db_user,
        db_password=req.db_password,
        run_seeder=req.run_seeder,
        seeder_class=req.seeder_class,
    )
    safe_env_vars = sanitize_env_vars(req.env_vars)

    # 8. Create and launch deployment session
    session = orchestrator.create_session(
        deployment_id,
        project_id,
        subdomain,
        target=target,
        db_overrides=db_overrides,
        env_vars=safe_env_vars,
    )
    asyncio.create_task(orchestrator.execute(session))

    return GitHubDeployResponse(
        deployment_id=deployment_id,
        project_id=project_id,
        subdomain=subdomain,
        status=session.status,
        repo_url=req.repo_url,
        target=target,
    )
