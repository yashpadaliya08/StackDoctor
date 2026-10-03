import io
import zipfile
from pathlib import Path
import pytest
from doctor.ingestion.zip_extractor import IngestionSecurityError, SafeZipExtractor


def test_safe_zip_extraction(temp_workspace):
    """Verifies standard zip archive extraction."""
    zip_path = temp_workspace / "test.zip"
    target_extract = temp_workspace / "extracted"

    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("composer.json", '{"require": {"php": "^8.2"}}')
        zf.writestr(".env.example", "APP_NAME=Laravel")

    root = SafeZipExtractor.extract(zip_path, target_extract)
    assert (root / "composer.json").exists()
    assert (root / ".env.example").exists()


def test_zip_folder_flattening(temp_workspace):
    """Verifies that single top-level folders inside ZIPs are properly flattened into target directory."""
    zip_path = temp_workspace / "nested.zip"
    target_extract = temp_workspace / "nested_extracted"

    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("CollegeProject/composer.json", '{"require": {}}')
        zf.writestr("CollegeProject/app/Http/Controllers/UserController.php", "<?php")

    root = SafeZipExtractor.extract(zip_path, target_extract)
    assert root == target_extract
    assert (target_extract / "composer.json").exists()
    assert (target_extract / "app" / "Http" / "Controllers" / "UserController.php").exists()
    assert not (target_extract / "CollegeProject").exists()


def test_zip_slip_prevention(temp_workspace):
    """Verifies that malicious path traversal filenames (../../) are detected and blocked."""
    zip_path = temp_workspace / "malicious.zip"
    target_extract = temp_workspace / "malicious_extracted"

    with zipfile.ZipFile(zip_path, "w") as zf:
        # Create an entry with path traversal
        zip_info = zipfile.ZipInfo("../../escaped.txt")
        zf.writestr(zip_info, "Malicious payload")

    with pytest.raises(IngestionSecurityError) as exc_info:
        SafeZipExtractor.extract(zip_path, target_extract)

    assert "path traversal" in str(exc_info.value).lower()


def test_zip_bomb_file_size_limit(temp_workspace, monkeypatch):
    """Verifies that files exceeding maximum allowed single-file size are rejected."""
    zip_path = temp_workspace / "bomb.zip"
    target_extract = temp_workspace / "bomb_extracted"

    # Lower limit artificially for test
    monkeypatch.setattr(SafeZipExtractor, "MAX_FILE_BYTES", 1024)

    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("large_file.dat", "x" * 2048)

    with pytest.raises(IngestionSecurityError) as exc_info:
        SafeZipExtractor.extract(zip_path, target_extract)

    assert "exceeding" in str(exc_info.value).lower()
