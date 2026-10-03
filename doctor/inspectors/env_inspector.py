import re
from pathlib import Path
from doctor.inspectors.base import BaseInspector
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    ProjectMetadata,
    Severity,
)


class EnvInspector(BaseInspector):
    """
    Inspects .env and .env.example files for configuration traps:
    - Missing APP_KEY (causes immediate 500 server crash)
    - APP_DEBUG=true in production (severe security vulnerability)
    - Localhost APP_URL (broken asset paths and OAuth redirects)
    - Missing production environment files
    """

    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> list[DiagnosticCheck]:
        checks: list[DiagnosticCheck] = []
        env_file = project_path / ".env"
        env_example_file = project_path / ".env.example"

        env_exists = env_file.is_file()
        example_exists = env_example_file.is_file()

        if not env_exists and not example_exists:
            checks.append(
                DiagnosticCheck(
                    id="env_file_completely_missing",
                    name="Environment Configuration",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title="Neither .env nor .env.example Found",
                    explanation="No environment file was detected. Laravel cannot boot without an environment configuration.",
                    remediation="A default production .env will be generated automatically.",
                    auto_fixable=True,
                )
            )
            return checks

        if not env_exists and example_exists:
            checks.append(
                DiagnosticCheck(
                    id="env_missing_has_example",
                    name="Environment Configuration",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title=".env Missing (Found .env.example)",
                    explanation="Production deployments require a .env file. Only .env.example was found in the repository.",
                    remediation="Generate a production .env based on .env.example with secure defaults.",
                    auto_fixable=True,
                )
            )
            active_file = env_example_file
        else:
            checks.append(
                DiagnosticCheck(
                    id="env_file_present",
                    name="Environment File Present",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title=".env File Detected",
                    explanation="Project contains a local or committed .env configuration file.",
                    remediation="None needed.",
                )
            )
            active_file = env_file

        env_vars = self._parse_env(active_file)

        # 1. APP_KEY Verification
        app_key = env_vars.get("APP_KEY", "").strip()
        if not app_key or app_key == "SomeRandomString" or app_key == "base64:":
            checks.append(
                DiagnosticCheck(
                    id="env_app_key_missing",
                    name="Application Encryption Key (APP_KEY)",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title="APP_KEY Is Missing or Empty",
                    explanation="Laravel uses APP_KEY for session cookies and encrypted data. Without it, the application crashes immediately with a 500 CryptographicException: 'No application encryption key has been specified.'",
                    remediation="Generate a fresh base64 AES-256 key automatically via 'php artisan key:generate' or our auto-fixer.",
                    auto_fixable=True,
                )
            )
        elif not (app_key.startswith("base64:") and len(app_key) >= 44):
            checks.append(
                DiagnosticCheck(
                    id="env_app_key_invalid",
                    name="Application Encryption Key (APP_KEY)",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title="APP_KEY Has Unusual Format",
                    explanation=f"APP_KEY is set ('{app_key[:10]}...') but does not follow the standard 32-byte base64 format (base64:... with length >= 44).",
                    remediation="Regenerate APP_KEY using standard base64 encoding.",
                    auto_fixable=True,
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="env_app_key_valid",
                    name="Application Encryption Key (APP_KEY)",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title="Valid APP_KEY Configured",
                    explanation="A valid 256-bit encryption key is present.",
                    remediation="None needed.",
                )
            )

        # 2. APP_DEBUG Check
        app_debug = env_vars.get("APP_DEBUG", "").strip().lower()
        if app_debug in ("true", "1", "yes"):
            checks.append(
                DiagnosticCheck(
                    id="env_app_debug_enabled",
                    name="Application Debug Mode",
                    category=CheckCategory.SECURITY,
                    status=CheckStatus.WARNING,
                    severity=Severity.CRITICAL,
                    title="APP_DEBUG is Set to True",
                    explanation="Leaving APP_DEBUG=true in production displays Ignition/Whoops error pages that leak database passwords, API keys, and server file paths to anyone who triggers an error.",
                    remediation="Set APP_DEBUG=false for production deployment.",
                    auto_fixable=True,
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="env_app_debug_secure",
                    name="Application Debug Mode",
                    category=CheckCategory.SECURITY,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title="Debug Mode Disabled (Secure)",
                    explanation="APP_DEBUG is false. Sensitive server paths and environment variables will not be leaked on error pages.",
                    remediation="None needed.",
                )
            )

        # 3. APP_URL Check
        app_url = env_vars.get("APP_URL", "").strip()
        if "localhost" in app_url or "127.0.0.1" in app_url:
            checks.append(
                DiagnosticCheck(
                    id="env_app_url_localhost",
                    name="Application URL (APP_URL)",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title=f"APP_URL Points to Localhost ({app_url})",
                    explanation="In production, leaving APP_URL as localhost causes generated email links, asset URLs, and redirects to fail when accessed over the internet.",
                    remediation="Update APP_URL to your assigned live deployment domain.",
                    auto_fixable=True,
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="env_app_url_configured",
                    name="Application URL (APP_URL)",
                    category=CheckCategory.ENVIRONMENT,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title=f"APP_URL Configured ({app_url or 'Auto-assigned'})",
                    explanation="APP_URL is not set to localhost.",
                    remediation="None needed.",
                )
            )

        return checks

    @classmethod
    def _parse_env(cls, env_path: Path) -> dict[str, str]:
        """Parses simple key=value pairs from .env files, ignoring comments and blanks."""
        content = cls.read_text_safe(env_path)
        if not content:
            return {}
        result: dict[str, str] = {}
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                result[key] = val
        return result
