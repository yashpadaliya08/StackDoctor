import re
from typing import Any, Dict, Optional
from fastapi import HTTPException

PROJECT_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{4,64}$")
DB_NAME_RE = re.compile(r"^[a-zA-Z0-9_]{1,64}$")
SEEDER_CLASS_RE = re.compile(r"^[a-zA-Z0-9_\\]{1,128}$")


def validate_project_id(project_id: str) -> str:
    """Validates project ID format strictly."""
    if not project_id or not PROJECT_ID_RE.match(project_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid project identifier format. Only alphanumeric characters, dashes, and underscores allowed (4-64 chars)."
        )
    return project_id


def sanitize_db_overrides(
    db_name: Optional[str] = None,
    db_user: Optional[str] = None,
    db_password: Optional[str] = None,
    run_seeder: bool = False,
    seeder_class: Optional[str] = None,
) -> Dict[str, Any]:
    """Validates and sanitizes database connection overrides."""
    db_overrides: Dict[str, Any] = {}

    if db_name:
        clean_db_name = db_name.strip()
        if not DB_NAME_RE.match(clean_db_name):
            raise HTTPException(
                status_code=400,
                detail="Invalid database name. Only alphanumeric characters and underscores are allowed (1-64 chars)."
            )
        db_overrides["db_name"] = clean_db_name

    if db_user:
        clean_db_user = db_user.strip()
        if not DB_NAME_RE.match(clean_db_user):
            raise HTTPException(
                status_code=400,
                detail="Invalid database username. Only alphanumeric characters and underscores are allowed."
            )
        db_overrides["db_user"] = clean_db_user

    if db_password is not None:
        if "\n" in db_password or "\r" in db_password:
            raise HTTPException(
                status_code=400,
                detail="Database password cannot contain newline characters."
            )
        db_overrides["db_password"] = db_password

    if run_seeder:
        db_overrides["run_seeder"] = True
        s_class = (seeder_class or "DatabaseSeeder").strip()
        if not SEEDER_CLASS_RE.match(s_class):
            raise HTTPException(
                status_code=400,
                detail="Invalid database seeder class name."
            )
        db_overrides["seeder_class"] = s_class

    return db_overrides


def sanitize_env_vars(env_vars: Optional[Dict[str, Any]]) -> Dict[str, str]:
    """Sanitizes user custom environment variables (disallow raw newlines / CRLF injection)."""
    safe_env_vars: Dict[str, str] = {}
    if not env_vars:
        return safe_env_vars

    for ek, ev in env_vars.items():
        k_str = str(ek).strip()
        v_str = str(ev)
        if not k_str:
            continue
        if "\n" in k_str or "\r" in k_str or "\n" in v_str or "\r" in v_str:
            raise HTTPException(
                status_code=400,
                detail=f"Environment variable '{k_str}' contains forbidden newline characters."
            )
        safe_env_vars[k_str] = v_str

    return safe_env_vars
