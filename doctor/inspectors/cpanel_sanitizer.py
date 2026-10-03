from pathlib import Path
from doctor.inspectors.base import BaseInspector
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    ProjectMetadata,
    Severity,
)


class CpanelSanitizer(BaseInspector):
    """
    Detects and fixes the classic cPanel shared hosting anti-pattern:
    Moving index.php out of public/ into the root directory to make it work on shared hosting,
    which dangerously exposes .env and project source code to anyone on the public web.
    """

    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> list[DiagnosticCheck]:
        checks: list[DiagnosticCheck] = []
        root_index = project_path / "index.php"
        public_index = project_path / "public" / "index.php"

        # Check if index.php was moved to root
        if root_index.is_file():
            content = self.read_text_safe(root_index) or ""
            is_laravel_index = "vendor/autoload.php" in content or "bootstrap/app.php" in content

            if is_laravel_index:
                metadata.is_cpanel_mangled = True
                checks.append(
                    DiagnosticCheck(
                        id="cpanel_mangled_root_index",
                        name="cPanel Layout Mangle Detection",
                        category=CheckCategory.SECURITY,
                        status=CheckStatus.FAILED,
                        severity=Severity.CRITICAL,
                        title="Critical: index.php Found in Project Root (cPanel Hack)",
                        explanation=(
                            "Detected index.php in the project root folder. This is a common cPanel workaround "
                            "that dangerously compromises security: it allows anyone to download your .env file "
                            "and source code via 'https://yourdomain.com/.env'. "
                            "In production, web servers MUST serve strictly from the 'public/' directory."
                        ),
                        remediation="Auto-repair project structure: restore index.php to public/ and configure Nginx document root strictly to public/.",
                        auto_fixable=True,
                        metadata={"root_index_present": True, "public_index_present": public_index.is_file()},
                    )
                )
                return checks

        checks.append(
            DiagnosticCheck(
                id="cpanel_layout_clean",
                name="Project Directory Structure",
                category=CheckCategory.SECURITY,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title="Clean Directory Layout (Document Root Isolated)",
                explanation="No root-level index.php hack detected. Web root correctly isolated to public/.",
                remediation="None needed.",
            )
        )
        return checks
