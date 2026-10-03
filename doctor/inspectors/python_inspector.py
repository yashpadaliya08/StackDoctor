import re
from pathlib import Path
from typing import List, Optional
from doctor.inspectors.base import BaseInspector
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    ProjectMetadata,
    Severity,
)


class PythonInspector(BaseInspector):
    """
    Inspects Python projects (FastAPI, Flask, Django, generic) for deployment readiness,
    dependency declarations, entrypoint validities, and server configurations.
    """

    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> List[DiagnosticCheck]:
        checks: List[DiagnosticCheck] = []

        framework = metadata.framework.lower()
        if "fastapi" in framework:
            fw_type = "fastapi"
        elif "flask" in framework:
            fw_type = "flask"
        elif "django" in framework:
            fw_type = "django"
        else:
            fw_type = "generic"

        # 1. Inspect Requirements / Dependencies
        checks.append(self._check_requirements(project_path, fw_type, metadata))

        # 2. Inspect Entrypoint File & Callable
        checks.append(self._check_entrypoint(project_path, fw_type, metadata))

        # 3. Inspect Environment Configuration
        checks.append(self._check_env(project_path, fw_type, metadata))

        # 4. Framework-Specific Checks
        if fw_type == "django":
            checks.extend(self._check_django_settings(project_path, metadata))
        elif fw_type == "fastapi":
            checks.append(self._check_fastapi_server(project_path, metadata))
        elif fw_type == "flask":
            checks.append(self._check_flask_server(project_path, metadata))

        # 5. Database Check
        checks.append(self._check_database(project_path, fw_type, metadata))

        return checks

    def _check_requirements(
        self, root: Path, fw_type: str, metadata: ProjectMetadata
    ) -> DiagnosticCheck:
        req_file = root / "requirements.txt"
        pyproject = root / "pyproject.toml"

        if req_file.is_file():
            content = self.read_text_safe(req_file) or ""
            packages = [line.strip().split("=")[0].split(">")[0].split("<")[0].lower() for line in content.splitlines() if line.strip() and not line.startswith("#")]
            metadata.framework_details["installed_packages"] = packages

            # Check if framework package is included
            missing = []
            if fw_type == "fastapi" and "fastapi" not in packages:
                missing.append("fastapi")
            if fw_type == "fastapi" and "uvicorn" not in packages:
                missing.append("uvicorn")
            if fw_type == "flask" and "flask" not in packages:
                missing.append("flask")
            if fw_type == "django" and "django" not in packages:
                missing.append("django")

            if missing:
                return DiagnosticCheck(
                    id="py_reqs_missing_core",
                    name="Core Dependencies in requirements.txt",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title="Missing Core Framework Package in requirements.txt",
                    explanation=f"Your requirements.txt is missing essential package(s): {', '.join(missing)}.",
                    remediation=f"Add {', '.join(missing)} to requirements.txt so the server can install them.",
                    auto_fixable=True,
                    metadata={"missing_packages": missing},
                )

            return DiagnosticCheck(
                id="py_requirements_found",
                name="Python Dependencies Manifest",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title="requirements.txt Found & Validated",
                explanation=f"Found {len(packages)} declared package(s) in requirements.txt.",
                remediation="No action needed.",
                auto_fixable=False,
            )

        if pyproject.is_file():
            return DiagnosticCheck(
                id="py_requirements_found",
                name="Python Dependencies Manifest",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title="pyproject.toml Found",
                explanation="Modern Python dependency specification pyproject.toml is present.",
                remediation="No action needed.",
                auto_fixable=False,
            )

        return DiagnosticCheck(
            id="py_requirements_missing",
            name="Python Dependencies Manifest",
            category=CheckCategory.RUNTIME,
            status=CheckStatus.FAILED,
            severity=Severity.CRITICAL,
            title="Missing requirements.txt",
            explanation="No requirements.txt or pyproject.toml was found. The deployment driver cannot determine required packages.",
            remediation="Create a requirements.txt with your project's dependencies or let Doctor auto-generate one.",
            auto_fixable=True,
            metadata={"fw_type": fw_type},
        )

    def _check_entrypoint(
        self, root: Path, fw_type: str, metadata: ProjectMetadata
    ) -> DiagnosticCheck:
        candidates = ["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "server.py"]
        existing = [c for c in candidates if (root / c).is_file()]

        if not existing:
            return DiagnosticCheck(
                id="py_entrypoint_missing",
                name="Python Application Entrypoint",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.FAILED,
                severity=Severity.CRITICAL,
                title="No Main Entrypoint Found",
                explanation="Could not find main.py, app.py, or manage.py in project root.",
                remediation="Ensure your main server file is in the root directory.",
                auto_fixable=False,
            )

        entrypoint = existing[0]
        metadata.detected_entrypoint = entrypoint
        entry_text = self.read_text_safe(root / entrypoint) or ""

        # Validate callable definition
        has_callable = False
        if fw_type == "fastapi" and ("FastAPI" in entry_text or "app = " in entry_text):
            has_callable = True
        elif fw_type == "flask" and ("Flask" in entry_text or "app = " in entry_text):
            has_callable = True
        elif fw_type == "django" and "manage.py" in existing:
            has_callable = True
        elif fw_type == "generic":
            has_callable = True

        if has_callable:
            return DiagnosticCheck(
                id="py_entrypoint_valid",
                name="Application Entrypoint & Callable",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title=f"Valid Entrypoint Detected ({entrypoint})",
                explanation=f"Detected application entrypoint at {entrypoint} with proper server definition.",
                remediation="No action needed.",
                auto_fixable=False,
            )

        return DiagnosticCheck(
            id="py_entrypoint_warning",
            name="Application Entrypoint & Callable",
            category=CheckCategory.RUNTIME,
            status=CheckStatus.WARNING,
            severity=Severity.WARNING,
            title=f"Entrypoint {entrypoint} Found Without Standard App Callable",
            explanation=f"{entrypoint} was found but does not contain a standard 'app = FastAPI()' or 'app = Flask(__name__)' definition.",
            remediation="Ensure your application instance is named 'app'.",
            auto_fixable=False,
        )

    def _check_env(
        self, root: Path, fw_type: str, metadata: ProjectMetadata
    ) -> DiagnosticCheck:
        env_file = root / ".env"
        env_example = root / ".env.example"

        if env_file.is_file():
            return DiagnosticCheck(
                id="py_env_ready",
                name="Environment Configuration (.env)",
                category=CheckCategory.ENVIRONMENT,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title="Environment File (.env) Present",
                explanation=".env file is present with project configuration.",
                remediation="No action needed.",
                auto_fixable=False,
            )

        return DiagnosticCheck(
            id="py_env_missing",
            name="Environment Configuration (.env)",
            category=CheckCategory.ENVIRONMENT,
            status=CheckStatus.WARNING,
            severity=Severity.WARNING,
            title="Missing .env File",
            explanation="No .env file was found. The application will rely on default settings or fail if environment variables are required.",
            remediation="Create a .env file with PORT, HOST, and SECRET_KEY, or allow Doctor to generate one.",
            auto_fixable=True,
            metadata={"has_example": env_example.is_file()},
        )

    def _check_django_settings(
        self, root: Path, metadata: ProjectMetadata
    ) -> List[DiagnosticCheck]:
        checks = []
        settings_files = list(root.glob("**/settings.py"))

        if not settings_files:
            checks.append(
                DiagnosticCheck(
                    id="py_django_settings_missing",
                    name="Django settings.py",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title="Django settings.py Not Found",
                    explanation="Could not locate settings.py in any subdirectory.",
                    remediation="Ensure your Django project configuration folder is present.",
                    auto_fixable=False,
                )
            )
            return checks

        settings_path = settings_files[0]
        content = self.read_text_safe(settings_path) or ""

        # Check ALLOWED_HOSTS
        allowed_match = re.search(r"ALLOWED_HOSTS\s*=\s*\[(.*?)\]", content, re.DOTALL)
        if allowed_match:
            hosts_str = allowed_match.group(1).strip()
            if not hosts_str or hosts_str == "[]" or ("'*'" not in hosts_str and '"*"' not in hosts_str):
                checks.append(
                    DiagnosticCheck(
                        id="py_django_allowed_hosts",
                        name="Django ALLOWED_HOSTS Configuration",
                        category=CheckCategory.SECURITY,
                        status=CheckStatus.WARNING,
                        severity=Severity.WARNING,
                        title="Restrictive ALLOWED_HOSTS Detected",
                        explanation="ALLOWED_HOSTS does not allow external Cloudflare tunnel domains (e.g. *.trycloudflare.com). Incoming HTTP requests will return 400 Bad Request.",
                        remediation="Set ALLOWED_HOSTS = ['*'] or include your tunnel domain in settings.py.",
                        auto_fixable=True,
                        metadata={"settings_file": str(settings_path.relative_to(root))},
                    )
                )
            else:
                checks.append(
                    DiagnosticCheck(
                        id="py_django_allowed_hosts",
                        name="Django ALLOWED_HOSTS Configuration",
                        category=CheckCategory.SECURITY,
                        status=CheckStatus.PASSED,
                        severity=Severity.INFO,
                        title="ALLOWED_HOSTS Configured for Edge Routing",
                        explanation="ALLOWED_HOSTS allows edge tunnel connections.",
                        remediation="No action needed.",
                        auto_fixable=False,
                    )
                )

        return checks

    def _check_fastapi_server(
        self, root: Path, metadata: ProjectMetadata
    ) -> DiagnosticCheck:
        req_file = root / "requirements.txt"
        has_uvicorn = False
        if req_file.is_file():
            content = self.read_text_safe(req_file) or ""
            has_uvicorn = "uvicorn" in content.lower()

        if has_uvicorn:
            return DiagnosticCheck(
                id="py_fastapi_uvicorn",
                name="ASGI Server (Uvicorn)",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title="Uvicorn ASGI Server Ready",
                explanation="Uvicorn is declared in requirements.txt for high-performance async serving.",
                remediation="No action needed.",
                auto_fixable=False,
            )

        return DiagnosticCheck(
            id="py_fastapi_uvicorn",
            name="ASGI Server (Uvicorn)",
            category=CheckCategory.RUNTIME,
            status=CheckStatus.WARNING,
            severity=Severity.WARNING,
            title="Uvicorn ASGI Server Not in requirements.txt",
            explanation="FastAPI requires an ASGI server like Uvicorn to run in production.",
            remediation="Add uvicorn[standard] to requirements.txt or allow Doctor to auto-add it.",
            auto_fixable=True,
        )

    def _check_flask_server(
        self, root: Path, metadata: ProjectMetadata
    ) -> DiagnosticCheck:
        return DiagnosticCheck(
            id="py_flask_ready",
            name="WSGI Runtime (Flask)",
            category=CheckCategory.RUNTIME,
            status=CheckStatus.PASSED,
            severity=Severity.INFO,
            title="Flask Application Server Ready",
            explanation="Flask runtime detected and will be served via built-in CLI or Gunicorn on Termux.",
            remediation="No action needed.",
            auto_fixable=False,
        )

    def _check_database(
        self, root: Path, fw_type: str, metadata: ProjectMetadata
    ) -> DiagnosticCheck:
        # Student Python apps overwhelmingly use SQLite or MariaDB
        has_sqlite = any(root.glob("**/*.sqlite3")) or any(root.glob("**/*.db"))
        metadata.db_connection = "sqlite"

        if has_sqlite:
            return DiagnosticCheck(
                id="py_db_sqlite",
                name="Database Configuration",
                category=CheckCategory.DATABASE,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title="SQLite Database Ready",
                explanation="Persistent SQLite database detected. Zero extra configuration needed.",
                remediation="No action needed.",
                auto_fixable=False,
            )

        return DiagnosticCheck(
            id="py_db_sqlite",
            name="Database Configuration",
            category=CheckCategory.DATABASE,
            status=CheckStatus.PASSED,
            severity=Severity.INFO,
            title="Database Ready (SQLite or MariaDB)",
            explanation="Project is ready to use local SQLite or the phone's MariaDB (MySQL 3306).",
            remediation="No action needed.",
            auto_fixable=False,
        )
