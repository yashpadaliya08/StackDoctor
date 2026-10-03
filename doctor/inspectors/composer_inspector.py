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


class ComposerInspector(BaseInspector):
    """
    Inspects composer.json to determine Laravel framework version,
    PHP version constraint, and required PHP extensions.
    """

    SUPPORTED_EXTENSIONS = {
        "bcmath", "ctype", "curl", "dom", "fileinfo", "filter", "hash",
        "iconv", "json", "libxml", "mbstring", "openssl", "pcre", "pdo",
        "pdo_mysql", "pdo_sqlite", "pdo_pgsql", "phar", "posix", "session",
        "simplexml", "soap", "sockets", "sodium", "spl", "standard",
        "tokenizer", "xml", "xmlreader", "xmlwriter", "zip", "zlib",
        "gd", "intl", "redis"
    }

    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> list[DiagnosticCheck]:
        checks: list[DiagnosticCheck] = []
        composer_file = project_path / "composer.json"

        if not composer_file.exists():
            checks.append(
                DiagnosticCheck(
                    id="composer_missing",
                    name="Composer Configuration",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title="composer.json Not Found",
                    explanation="No composer.json file was detected in the project root. Laravel requires composer.json to define dependencies and autoloading.",
                    remediation="Ensure your project files are at the root level and include a valid composer.json.",
                    auto_fixable=False,
                )
            )
            return checks

        composer_data = self.read_json_safe(composer_file)
        if composer_data is None:
            checks.append(
                DiagnosticCheck(
                    id="composer_syntax_error",
                    name="Composer Syntax",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.FAILED,
                    severity=Severity.CRITICAL,
                    title="Malformed composer.json",
                    explanation="composer.json contains invalid JSON syntax and could not be parsed.",
                    remediation="Validate composer.json using a JSON linter or run 'composer validate' locally.",
                    auto_fixable=False,
                )
            )
            return checks

        checks.append(
            DiagnosticCheck(
                id="composer_valid",
                name="Composer Configuration",
                category=CheckCategory.RUNTIME,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title="Valid composer.json Detected",
                explanation="composer.json was successfully located and parsed.",
                remediation="None needed.",
            )
        )

        requires = composer_data.get("require", {})
        if not isinstance(requires, dict):
            requires = {}

        # 1. Detect Laravel Framework Version
        framework_constraint = requires.get("laravel/framework")
        if framework_constraint:
            metadata.framework_version = self._clean_version(str(framework_constraint))
            checks.append(
                DiagnosticCheck(
                    id="laravel_framework_detected",
                    name="Laravel Framework Version",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title=f"Laravel {metadata.framework_version} Detected",
                    explanation=f"Project is powered by Laravel framework constraint: {framework_constraint}.",
                    remediation="None needed.",
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="laravel_framework_missing",
                    name="Laravel Framework Check",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title="laravel/framework Dependency Not Explicitly Listed",
                    explanation="Could not find 'laravel/framework' in require section of composer.json. This might be a Lumen project or a customized installation.",
                    remediation="Verify that this is a standard Laravel web application.",
                )
            )

        # 2. Detect & Resolve PHP Version
        php_constraint = requires.get("php")
        metadata.php_requirement = str(php_constraint) if php_constraint else None
        resolved_php = self._resolve_php_version(metadata.php_requirement)
        metadata.resolved_php_version = resolved_php

        if metadata.php_requirement:
            checks.append(
                DiagnosticCheck(
                    id="php_version_check",
                    name="PHP Version Requirement",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title=f"PHP {metadata.php_requirement} Required (Resolved to {resolved_php})",
                    explanation=f"Project requires PHP {metadata.php_requirement}. The deployment environment will be configured with PHP {resolved_php}.",
                    remediation="None needed.",
                    metadata={"resolved_version": resolved_php},
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="php_version_unspecified",
                    name="PHP Version Requirement",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title=f"No Explicit PHP Version Constraint (Defaulting to {resolved_php})",
                    explanation="composer.json does not declare an explicit PHP version under 'require'. Defaulting to PHP 8.3.",
                    remediation="Specify a PHP version in composer.json (e.g. \"php\": \"^8.2\").",
                    auto_fixable=False,
                )
            )

        # 3. Check Required PHP Extensions
        missing_unsupported: list[str] = []
        for pkg_name in requires.keys():
            if pkg_name.startswith("ext-"):
                ext_name = pkg_name[4:].lower()
                if ext_name not in self.SUPPORTED_EXTENSIONS:
                    missing_unsupported.append(ext_name)

        if missing_unsupported:
            checks.append(
                DiagnosticCheck(
                    id="php_uncommon_extensions",
                    name="PHP Extension Compatibility",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title=f"Uncommon PHP Extensions: {', '.join(missing_unsupported)}",
                    explanation=f"Project requires extensions not pre-installed in the default production container: {missing_unsupported}.",
                    remediation="These extensions must be compiled into the custom container Dockerfile.",
                    auto_fixable=True,
                    metadata={"extensions": missing_unsupported},
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="php_extensions_ok",
                    name="PHP Extension Compatibility",
                    category=CheckCategory.RUNTIME,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title="All Required PHP Extensions Supported",
                    explanation="All standard Laravel extensions (pdo_mysql, pdo_sqlite, bcmath, gd, intl, zip, etc.) are fully supported.",
                    remediation="None needed.",
                )
            )

        return checks

    @staticmethod
    def _clean_version(constraint: str) -> str:
        """Extracts major/minor version numbers from semver constraints like ^11.0 or ~10.4."""
        match = re.search(r"(\d+(\.\d+)?)", constraint)
        return match.group(1) if match else constraint

    @staticmethod
    def _resolve_php_version(constraint: str | None) -> str:
        """Determines best standard Docker PHP image version based on semver constraint."""
        if not constraint:
            return "8.3"
        if "8.4" in constraint:
            return "8.4"
        if "8.3" in constraint:
            return "8.3"
        if "8.2" in constraint:
            return "8.2"
        if "8.1" in constraint:
            return "8.1"
        if "8.0" in constraint or "7." in constraint:
            return "8.1"  # Modern images rarely maintain 7.x/8.0
        return "8.3"
