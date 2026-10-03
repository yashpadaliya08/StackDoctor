from typing import Tuple
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    Severity,
)


class Scorer:
    """
    Calculates the 0-100% Deployment Readiness Score based on weighted categories:
    - Core Runtime: 30%
    - Environment & Security: 30%
    - Database: 20%
    - Assets & Bundler: 10%
    - Storage & Permissions: 10%
    """

    @classmethod
    def calculate_score(cls, checks: list[DiagnosticCheck]) -> Tuple[int, str]:
        checks_by_id = {c.id: c for c in checks}

        # Handle Python Stack projects
        if any(c.id.startswith("py_") for c in checks):
            score = 0
            # Requirements: 25 pts
            if checks_by_id.get("py_requirements_found") and checks_by_id["py_requirements_found"].status == CheckStatus.PASSED:
                score += 25
            elif checks_by_id.get("py_reqs_missing_core"):
                score += 15

            # Entrypoint: 25 pts
            if checks_by_id.get("py_entrypoint_valid") and checks_by_id["py_entrypoint_valid"].status == CheckStatus.PASSED:
                score += 25
            elif checks_by_id.get("py_entrypoint_warning"):
                score += 15

            # Env: 20 pts
            if checks_by_id.get("py_env_ready") and checks_by_id["py_env_ready"].status == CheckStatus.PASSED:
                score += 20
            elif checks_by_id.get("py_env_missing"):
                score += 5

            # Server / Framework check: 15 pts
            for fid in ("py_fastapi_uvicorn", "py_flask_ready", "py_django_allowed_hosts"):
                if checks_by_id.get(fid):
                    if checks_by_id[fid].status == CheckStatus.PASSED:
                        score += 15
                    elif checks_by_id[fid].status == CheckStatus.WARNING:
                        score += 8
                    break

            # Database: 15 pts
            if checks_by_id.get("py_db_sqlite") and checks_by_id["py_db_sqlite"].status == CheckStatus.PASSED:
                score += 15

            total = max(0, min(100, score))
            if total >= 85:
                summary = "Production Ready: Python application passes all health and dependency checks."
            elif total >= 65:
                summary = "Mostly Ready: Minor configuration items require attention before deployment."
            elif total >= 50:
                summary = "Needs Attention: Missing dependencies or .env file detected."
            else:
                summary = "Critical Issues: Missing requirements.txt or entrypoint."
            return total, summary

        # Handle Node.js / Express / MERN projects
        if any(c.id.startswith("node_") or c.id.startswith("mern_") for c in checks):
            score = 0
            if checks_by_id.get("node_package_json_valid") and checks_by_id["node_package_json_valid"].status == CheckStatus.PASSED:
                score += 25
            if checks_by_id.get("node_start_script") and checks_by_id["node_start_script"].status == CheckStatus.PASSED:
                score += 25
            elif checks_by_id.get("node_start_script"):
                score += 10
            if checks_by_id.get("node_entrypoint_valid") and checks_by_id["node_entrypoint_valid"].status == CheckStatus.PASSED:
                score += 20
            if checks_by_id.get("node_env_present") and checks_by_id["node_env_present"].status == CheckStatus.PASSED:
                score += 15
            elif checks_by_id.get("node_env_present"):
                score += 5
            if checks_by_id.get("node_port_binding") and checks_by_id["node_port_binding"].status == CheckStatus.PASSED:
                score += 15
            else:
                score += 10

            total = max(0, min(100, score))
            if total >= 85:
                summary = "Production Ready: Node.js / MERN service is ready for cloud deployment."
            elif total >= 65:
                summary = "Mostly Ready: Minor configuration or script adjustments needed."
            else:
                summary = "Needs Attention: Missing start script or server entrypoint."
            return total, summary

        # 1. Core Runtime (30 pts max)
        runtime_pts = 0
        if checks_by_id.get("composer_valid", None) and checks_by_id["composer_valid"].status == CheckStatus.PASSED:
            runtime_pts += 15
        if checks_by_id.get("php_version_check", None) and checks_by_id["php_version_check"].status == CheckStatus.PASSED:
            runtime_pts += 10
        elif checks_by_id.get("php_version_unspecified", None):
            runtime_pts += 5
        if checks_by_id.get("php_extensions_ok", None) and checks_by_id["php_extensions_ok"].status == CheckStatus.PASSED:
            runtime_pts += 5

        # 2. Environment & Security (30 pts max)
        env_pts = 0
        if checks_by_id.get("env_app_key_valid", None) and checks_by_id["env_app_key_valid"].status == CheckStatus.PASSED:
            env_pts += 15
        elif checks_by_id.get("env_app_key_invalid", None):
            env_pts += 5

        if checks_by_id.get("env_app_debug_secure", None) and checks_by_id["env_app_debug_secure"].status == CheckStatus.PASSED:
            env_pts += 10
        elif checks_by_id.get("env_app_debug_enabled", None):
            env_pts += 0  # High security risk

        if checks_by_id.get("cpanel_layout_clean", None) and checks_by_id["cpanel_layout_clean"].status == CheckStatus.PASSED:
            env_pts += 5
        else:
            env_pts += 0  # Mangled root index

        # 3. Database (20 pts max)
        db_pts = 0
        if checks_by_id.get("db_driver_detected", None):
            db_pts += 5
        if checks_by_id.get("db_host_remote", None):
            db_pts += 5
        elif checks_by_id.get("db_host_localhost_trap", None):
            db_pts += 2  # Warning, fixable
        elif checks_by_id.get("db_sqlite_file_present", None):
            db_pts += 5

        if checks_by_id.get("db_migrations_found", None):
            db_pts += 10
        elif checks_by_id.get("db_migrations_empty", None) or checks_by_id.get("db_migrations_missing_dir", None):
            db_pts += 3

        # 4. Assets & Bundler (10 pts max)
        asset_pts = 0
        if checks_by_id.get("assets_no_bundler", None):
            asset_pts = 10
        elif checks_by_id.get("assets_vite_manifest_present", None):
            asset_pts = 10
        elif checks_by_id.get("assets_vite_manifest_missing", None):
            asset_pts = 5  # Fixable via multi-stage build

        # 5. Storage & Permissions (10 pts max)
        storage_pts = 0
        if checks_by_id.get("storage_dirs_ok", None):
            storage_pts += 5
        if checks_by_id.get("storage_symlink_present", None):
            storage_pts += 5

        total = max(0, min(100, runtime_pts + env_pts + db_pts + asset_pts + storage_pts))

        # Determine narrative summary
        if total >= 90:
            summary = "Production Ready: Application passes all critical health and security checks."
        elif total >= 70:
            summary = "Mostly Ready: Minor configuration items require attention before deployment."
        elif total >= 50:
            summary = "Needs Attention: Configuration warnings and missing build steps detected."
        else:
            summary = "Critical Issues Detected: Crucial files or keys are missing. Auto-fixes available."

        return total, summary
