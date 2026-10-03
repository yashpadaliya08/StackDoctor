from pathlib import Path
from doctor.inspectors.base import BaseInspector
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    ProjectMetadata,
    Severity,
)


class StorageInspector(BaseInspector):
    """
    Inspects storage directories, bootstrap cache folders, and public/storage symlink.
    Prevents image 404s and log file permission crashes.
    """

    REQUIRED_STORAGE_DIRS = [
        "storage/app",
        "storage/app/public",
        "storage/framework",
        "storage/framework/cache",
        "storage/framework/sessions",
        "storage/framework/views",
        "storage/logs",
        "bootstrap/cache",
    ]

    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> list[DiagnosticCheck]:
        checks: list[DiagnosticCheck] = []

        # 1. Check Directory Tree
        missing_dirs: list[str] = []
        for rel_dir in self.REQUIRED_STORAGE_DIRS:
            full_dir = project_path / rel_dir
            if not full_dir.is_dir():
                missing_dirs.append(rel_dir)

        if missing_dirs:
            checks.append(
                DiagnosticCheck(
                    id="storage_dirs_missing",
                    name="Laravel Storage Directories",
                    category=CheckCategory.STORAGE,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title=f"{len(missing_dirs)} Storage Subdirectories Missing",
                    explanation=f"Missing storage folders: {', '.join(missing_dirs)}. Laravel requires these folders for sessions, compiled Blade views, and log files.",
                    remediation="Auto-create missing storage directories and apply 775 permissions.",
                    auto_fixable=True,
                    metadata={"missing": missing_dirs},
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="storage_dirs_ok",
                    name="Laravel Storage Directories",
                    category=CheckCategory.STORAGE,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title="Storage & Cache Directories Complete",
                    explanation="All required storage/ and bootstrap/cache/ directories are present.",
                    remediation="None needed.",
                )
            )

        # 2. Check public/storage symlink
        public_storage = project_path / "public" / "storage"
        has_symlink = public_storage.is_symlink() or public_storage.exists()
        metadata.has_storage_link = has_symlink

        if not has_symlink:
            checks.append(
                DiagnosticCheck(
                    id="storage_symlink_missing",
                    name="Public Storage Symlink",
                    category=CheckCategory.STORAGE,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title="Storage Symlink (public/storage) Missing",
                    explanation="In Laravel, files uploaded to 'storage/app/public' (such as profile pictures or documents) return 404 in the browser unless a symbolic link is created from 'public/storage' -> 'storage/app/public'.",
                    remediation="Run 'php artisan storage:link'. We include this automatically in the container startup sequence.",
                    auto_fixable=True,
                )
            )
        else:
            checks.append(
                DiagnosticCheck(
                    id="storage_symlink_present",
                    name="Public Storage Symlink",
                    category=CheckCategory.STORAGE,
                    status=CheckStatus.PASSED,
                    severity=Severity.INFO,
                    title="Storage Symlink Configured",
                    explanation="public/storage is present, allowing public access to storage/app/public.",
                    remediation="None needed.",
                )
            )

        return checks
