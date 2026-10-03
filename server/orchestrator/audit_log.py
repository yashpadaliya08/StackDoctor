"""
Immutable Security Audit Log Engine
===================================
Tracks and stores all security-sensitive and operational actions across the platform.
Logs are saved in an append-only, high-performance JSONL file.
"""

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from server.config import DATA_DIR

AUDIT_LOG_FILE = DATA_DIR / "audit_log.jsonl"
AUDIT_LOG_ROTATED = DATA_DIR / "audit_log.1.jsonl"
MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
_lock = threading.Lock()


class SecurityAuditLog:
    """Thread-safe persistent audit recorder with automatic log rotation."""

    @classmethod
    def _rotate_if_needed(cls) -> None:
        """Rotates the log file if it exceeds MAX_LOG_SIZE_BYTES."""
        try:
            if AUDIT_LOG_FILE.exists() and AUDIT_LOG_FILE.stat().st_size > MAX_LOG_SIZE_BYTES:
                if AUDIT_LOG_ROTATED.exists():
                    AUDIT_LOG_ROTATED.unlink()
                AUDIT_LOG_FILE.rename(AUDIT_LOG_ROTATED)
        except Exception as e:
            print(f"[AUDIT ROTATION ERROR]: {e}")

    @classmethod
    def record(
        cls,
        action: str,
        project_id: str = "SYSTEM",
        actor: str = "operator",
        details: str = "",
        status: str = "SUCCESS",
        client_ip: str = "127.0.0.1",
        metadata: dict | None = None,
    ) -> dict:
        """Appends an immutable audit event to the audit trail with size capping."""
        timestamp_iso = datetime.now(timezone.utc).isoformat()
        record = {
            "id": f"audit_{int(time.time() * 1000)}_{os.urandom(3).hex()}",
            "timestamp": timestamp_iso,
            "action": action,
            "project_id": project_id,
            "actor": actor,
            "details": details,
            "status": status,
            "client_ip": client_ip,
            "metadata": metadata or {},
        }

        with _lock:
            try:
                cls._rotate_if_needed()
                AUDIT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
                with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
                    f.write(json.dumps(record) + "\n")
            except Exception as e:
                print(f"[AUDIT ERROR] Failed to write audit log: {e}")

        return record

    @staticmethod
    def query(
        limit: int = 50,
        action_filter: str | None = None,
        project_filter: str | None = None,
        search_query: str | None = None,
    ) -> list[dict]:
        """Reads and filters recent audit records in reverse chronological order."""
        if not AUDIT_LOG_FILE.exists():
            return []

        results = []
        with _lock:
            try:
                # Read last 512KB to avoid slurping massive files into RAM
                file_size = AUDIT_LOG_FILE.stat().st_size
                with open(AUDIT_LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
                    if file_size > 512 * 1024:
                        f.seek(file_size - (512 * 1024))
                        # Discard partial line
                        f.readline()
                    lines = f.readlines()
            except Exception:
                return []

        # Read newest lines first
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except Exception:
                continue

            if action_filter and entry.get("action") != action_filter:
                continue
            if project_filter and entry.get("project_id") != project_filter:
                continue
            if search_query:
                sq = search_query.lower()
                blob = f"{entry.get('action')} {entry.get('details')} {entry.get('project_id')} {entry.get('actor')}".lower()
                if sq not in blob:
                    continue

            results.append(entry)
            if len(results) >= limit:
                break

        return results


# Global singleton
audit_logger = SecurityAuditLog()
