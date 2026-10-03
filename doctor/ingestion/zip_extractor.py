import os
import zipfile
from pathlib import Path
from typing import Tuple


class IngestionSecurityError(Exception):
    """Raised when an uploaded archive violates sandboxing or security constraints."""
    pass


class SafeZipExtractor:
    """
    Safely extracts user-provided ZIP archives with defense against:
    - Zip Slip (path traversal ../../)
    - Zip Bombs (uncompressed size, file count, and single-file size quotas)
    - Automatically flattens single root directories commonly created by Windows/Mac 'Compress' tool.
    """

    MAX_UNCOMPRESSED_BYTES = 300 * 1024 * 1024  # 300 MB
    MAX_FILE_BYTES = 50 * 1024 * 1024           # 50 MB
    MAX_FILE_COUNT = 15_000                      # 15,000 files

    @classmethod
    def extract(cls, zip_path: str | Path, target_dir: str | Path) -> Path:
        zip_path = Path(zip_path).resolve()
        target_dir = Path(target_dir).resolve()

        if not zip_path.is_file():
            raise FileNotFoundError(f"ZIP file not found at: {zip_path}")

        target_dir.mkdir(parents=True, exist_ok=True)

        total_bytes = 0
        file_count = 0

        with zipfile.ZipFile(zip_path, "r") as zf:
            infolist = zf.infolist()

            if len(infolist) > cls.MAX_FILE_COUNT:
                raise IngestionSecurityError(
                    f"Archive exceeds maximum allowed file count ({len(infolist)} > {cls.MAX_FILE_COUNT})"
                )

            # Pre-validate all file entries for Zip Slip & quotas before writing anything
            for member in infolist:
                file_count += 1
                total_bytes += member.file_size

                if member.file_size > cls.MAX_FILE_BYTES:
                    raise IngestionSecurityError(
                        f"Archive contains a file exceeding 50MB limit: {member.filename} ({member.file_size} bytes)"
                    )

                if total_bytes > cls.MAX_UNCOMPRESSED_BYTES:
                    raise IngestionSecurityError(
                        f"Archive exceeds total uncompressed size limit of 300MB ({total_bytes} bytes)"
                    )

                # Zip Slip check
                extracted_path = (target_dir / member.filename).resolve()
                try:
                    # Must be inside target_dir
                    extracted_path.relative_to(target_dir)
                except ValueError:
                    raise IngestionSecurityError(
                        f"Potentially malicious path traversal in archive: {member.filename}"
                    )

            # Safe extraction
            zf.extractall(target_dir)

        # Normalize project root by flattening if archive contained a single nested folder
        cls._flatten_if_nested(target_dir)
        return target_dir

    @classmethod
    def _flatten_if_nested(cls, extracted_dir: Path) -> None:
        """
        If the extracted directory contains only a single subdirectory (ignoring metadata like .DS_Store, __MACOSX)
        and that subdirectory contains composer.json or Laravel files, move all its contents up into extracted_dir.
        """
        import shutil

        # Clean macOS metadata
        macosx = extracted_dir / "__MACOSX"
        if macosx.exists():
            shutil.rmtree(macosx, ignore_errors=True)
        ds_store = extracted_dir / ".DS_Store"
        if ds_store.exists():
            ds_store.unlink(missing_ok=True)

        root_indicators = [
            "composer.json",
            "artisan",
            "package.json",
            "requirements.txt",
            "manage.py",
            "main.py",
            "app.py",
            "server.js",
        ]
        if any((extracted_dir / ind).exists() for ind in root_indicators):
            return

        children = [p for p in extracted_dir.iterdir() if p.name not in (".DS_Store", "__MACOSX")]
        if len(children) == 1 and children[0].is_dir():
            candidate = children[0]
            if any((candidate / ind).exists() for ind in root_indicators):
                for item in list(candidate.iterdir()):
                    dest = extracted_dir / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest, ignore_errors=True)
                        else:
                            dest.unlink(missing_ok=True)
                    shutil.move(str(item), str(extracted_dir))
                shutil.rmtree(candidate, ignore_errors=True)
