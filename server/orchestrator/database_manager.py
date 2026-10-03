import secrets
from pathlib import Path
from typing import Any, Dict


class DatabaseManager:
    """
    Manages automated database provisioning for student projects:
    - SQLite persistent storage initialization
    - Multi-tenant shared MySQL schema & isolated credential generation
    """

    @classmethod
    def provision_sqlite(cls, project_path: Path) -> Dict[str, str]:
        db_dir = project_path / "database"
        db_dir.mkdir(parents=True, exist_ok=True)
        sqlite_file = db_dir / "database.sqlite"
        if not sqlite_file.exists():
            sqlite_file.touch()

        return {
            "DB_CONNECTION": "sqlite",
            "DB_DATABASE": "/var/www/html/database/database.sqlite",
        }

    @classmethod
    def provision_mysql(cls, project_id: str, host: str = "mysql-internal") -> Dict[str, Any]:
        clean_id = "".join(c for c in project_id if c.isalnum())[:8]
        db_name = f"db_{clean_id}"
        db_user = f"usr_{clean_id}"
        db_pass = secrets.token_urlsafe(16)

        provision_sql = f"""-- Auto-provisioned for Student Project {project_id}
CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '{db_user}'@'%' IDENTIFIED BY '{db_pass}';
GRANT ALL PRIVILEGES ON `{db_name}`.* TO '{db_user}'@'%';
FLUSH PRIVILEGES;
"""

        env_vars = {
            "DB_CONNECTION": "mysql",
            "DB_HOST": host,
            "DB_PORT": "3306",
            "DB_DATABASE": db_name,
            "DB_USERNAME": db_user,
            "DB_PASSWORD": db_pass,
        }

        return {
            "env_vars": env_vars,
            "provision_sql": provision_sql,
            "db_name": db_name,
            "db_user": db_user,
        }
