import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Optional
from doctor.models import DiagnosticCheck, ProjectMetadata


class BaseInspector(ABC):
    """
    Abstract base class for all deterministic static inspectors.
    Inspectors MUST NOT execute arbitrary PHP code or shell scripts.
    """

    @abstractmethod
    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> list[DiagnosticCheck]:
        """
        Runs diagnostic rules against the given project directory and mutates/updates metadata if relevant.
        Returns a list of DiagnosticCheck findings.
        """
        pass

    @staticmethod
    def read_text_safe(file_path: Path) -> Optional[str]:
        """Safely reads a text file handling different encodings."""
        if not file_path.is_file():
            return None
        for encoding in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                return file_path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        return None

    @staticmethod
    def read_json_safe(file_path: Path) -> Optional[dict[str, Any]]:
        """Safely parses a JSON file."""
        content = BaseInspector.read_text_safe(file_path)
        if content is None:
            return None
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                return data
            return None
        except Exception:
            return None
