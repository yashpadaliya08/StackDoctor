import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from server.config import DEPLOYMENTS_DIR

logger = logging.getLogger("doctor.registry")

REGISTRY_FILE = DEPLOYMENTS_DIR / "deployments_registry.json"


class DeploymentRecord:
    def __init__(
        self,
        deployment_id: str,
        project_id: str,
        project_name: str,
        framework: str,
        subdomain: str,
        port: int,
        target: str = "phone",
        live_url: Optional[str] = None,
        status: str = "RUNNING",
        created_at: Optional[str] = None,
        updated_at: Optional[str] = None,
    ):
        self.deployment_id = deployment_id
        self.project_id = project_id
        self.project_name = project_name
        self.framework = framework
        self.subdomain = subdomain
        self.port = port
        self.target = target
        self.live_url = live_url
        self.status = status
        now_str = datetime.now(timezone.utc).isoformat()
        self.created_at = created_at or now_str
        self.updated_at = updated_at or now_str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "deployment_id": self.deployment_id,
            "project_id": self.project_id,
            "project_name": self.project_name,
            "framework": self.framework,
            "subdomain": self.subdomain,
            "port": self.port,
            "target": self.target,
            "live_url": self.live_url,
            "status": self.status,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeploymentRecord":
        return cls(
            deployment_id=data.get("deployment_id", ""),
            project_id=data.get("project_id", ""),
            project_name=data.get("project_name", data.get("project_id", "")),
            framework=data.get("framework", "laravel"),
            subdomain=data.get("subdomain", ""),
            port=int(data.get("port", 8080)),
            target=data.get("target", "phone"),
            live_url=data.get("live_url"),
            status=data.get("status", "RUNNING"),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )


class DeploymentRegistry:
    """Persistent storage for all active and past deployments with thread-safe access."""

    def __init__(self, file_path: Path = REGISTRY_FILE):
        self.file_path = file_path
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self._records: Dict[str, DeploymentRecord] = {}
        self._lock = threading.Lock()
        self._last_mtime: float = 0.0
        self._load()

    def _load(self) -> None:
        if self.file_path.exists():
            try:
                self._last_mtime = self.file_path.stat().st_mtime
                data = json.loads(self.file_path.read_text(encoding="utf-8"))
                self._records = {k: DeploymentRecord.from_dict(v) for k, v in data.items()}
            except Exception as e:
                logger.warning(f"Failed to load registry: {e}")
                self._records = {}

        # Migration from legacy latest_active.json if registry is empty
        legacy_file = DEPLOYMENTS_DIR / "latest_active.json"
        if not self._records and legacy_file.exists():
            try:
                legacy_data = json.loads(legacy_file.read_text(encoding="utf-8"))
                pid = legacy_data.get("project_id")
                if pid:
                    rec = DeploymentRecord(
                        deployment_id=legacy_data.get("deployment_id", pid),
                        project_id=pid,
                        project_name=pid,
                        framework="fastapi" if "python" in pid.lower() else "laravel",
                        subdomain=legacy_data.get("subdomain", pid),
                        port=8924 if "python" in pid.lower() else 8695,
                        target=legacy_data.get("target", "phone"),
                        live_url=legacy_data.get("live_url"),
                        status=legacy_data.get("status", "RUNNING"),
                        created_at=legacy_data.get("created_at"),
                    )
                    self._records[pid] = rec
                    self._save()
            except Exception:
                pass

    def _save(self) -> None:
        try:
            import os
            payload = {k: v.to_dict() for k, v in self._records.items()}
            tmp_file = self.file_path.parent / f"{self.file_path.name}.{os.getpid()}.tmp"
            tmp_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
            os.replace(tmp_file, self.file_path)
            self._last_mtime = self.file_path.stat().st_mtime
        except Exception as e:
            logger.error(f"Failed to persist registry: {e}")

    def upsert(self, record: DeploymentRecord) -> None:
        with self._lock:
            record.updated_at = datetime.now(timezone.utc).isoformat()
            self._records[record.project_id] = record
            self._save()

    def get(self, identifier: str) -> Optional[DeploymentRecord]:
        with self._lock:
            if identifier in self._records:
                return self._records[identifier]
            for rec in self._records.values():
                if rec.deployment_id == identifier:
                    return rec
            return None

    def list_all(self) -> List[DeploymentRecord]:
        """Returns all deployments sorted by updated_at descending using in-memory state."""
        with self._lock:
            # Only reload from disk if an external process updated the file
            try:
                if self.file_path.exists():
                    current_mtime = self.file_path.stat().st_mtime
                    if current_mtime > self._last_mtime:
                        self._load()
            except Exception:
                pass

            records = list(self._records.values())
            records.sort(key=lambda r: r.updated_at, reverse=True)
            return records

    def update_status(self, project_id: str, status: str, live_url: Optional[str] = None) -> bool:
        with self._lock:
            rec = None
            if project_id in self._records:
                rec = self._records[project_id]
            else:
                for r in self._records.values():
                    if r.deployment_id == project_id:
                        rec = r
                        break

            if rec:
                rec.status = status
                if live_url:
                    rec.live_url = live_url
                rec.updated_at = datetime.now(timezone.utc).isoformat()
                self._save()
                return True
            return False

    def remove(self, identifier: str) -> bool:
        with self._lock:
            if identifier in self._records:
                del self._records[identifier]
                self._save()
                return True
            for k, rec in list(self._records.items()):
                if rec.deployment_id == identifier:
                    del self._records[k]
                    self._save()
                    return True
            return False


# Global Registry Singleton
deployment_registry = DeploymentRegistry()

