from pathlib import Path
from doctor.inspectors.base import BaseInspector
from doctor.inspectors.env_inspector import EnvInspector
from doctor.models import (
    CheckCategory,
    CheckStatus,
    DiagnosticCheck,
    ProjectMetadata,
    Severity,
)


class DatabaseInspector(BaseInspector):
    """
    Inspects database configurations and migration files:
    - Detects whether MySQL, SQLite, or PostgreSQL is required
    - Identifies the DB_HOST=127.0.0.1 container networking trap
    - Inspects database/migrations/ structure
    """

    def inspect(self, project_path: Path, metadata: ProjectMetadata) -> list[DiagnosticCheck]:
        checks: list[DiagnosticCheck] = []

        # Read active environment configuration
        env_file = project_path / ".env"
        if not env_file.exists():
            env_file = project_path / ".env.example"

        env_vars = EnvInspector._parse_env(env_file) if env_file.exists() else {}

        # 1. Detect Connection Driver
        db_conn = env_vars.get("DB_CONNECTION", "").strip().lower()

        # Fallback to Laravel 11/12 default if omitted
        if not db_conn:
            if (project_path / "database" / "database.sqlite").exists():
                db_conn = "sqlite"
            else:
                db_conn = "mysql"  # Default in Laravel 10 and classic student projects

        metadata.db_connection = db_conn

        checks.append(
            DiagnosticCheck(
                id="db_driver_detected",
                name="Database Driver Detection",
                category=CheckCategory.DATABASE,
                status=CheckStatus.PASSED,
                severity=Severity.INFO,
                title=f"{db_conn.upper()} Database Driver Detected",
                explanation=f"Project is configured to use the '{db_conn}' database connection.",
                remediation="None needed.",
                metadata={"driver": db_conn},
            )
        )

        # 2. Check for the Docker Localhost Trap if MySQL
        if db_conn == "mysql":
            db_host = env_vars.get("DB_HOST", "127.0.0.1").strip()
            if db_host in ("127.0.0.1", "localhost"):
                checks.append(
                    DiagnosticCheck(
                        id="db_host_localhost_trap",
                        name="Database Host Networking",
                        category=CheckCategory.DATABASE,
                        status=CheckStatus.WARNING,
                        severity=Severity.CRITICAL,
                        title=f"DB_HOST is Set to '{db_host}' (Container Trap)",
                        explanation="In a production container, '127.0.0.1' points to the container itself, NOT your MySQL database. This causes the fatal error: 'SQLSTATE[HY000] [2002] Connection refused'.",
                        remediation="Automatically update DB_HOST to the internal managed database host (e.g. 'mysql-internal') or your cloud DB endpoint.",
                        auto_fixable=True,
                        metadata={"current_host": db_host},
                    )
                )
            else:
                checks.append(
                    DiagnosticCheck(
                        id="db_host_remote",
                        name="Database Host Networking",
                        category=CheckCategory.DATABASE,
                        status=CheckStatus.PASSED,
                        severity=Severity.INFO,
                        title=f"External/Named Database Host Configured ({db_host})",
                        explanation=f"Database host is set to '{db_host}', which will not conflict with local container loopback.",
                        remediation="None needed.",
                    )
                )

        # 3. Check for SQLite database file
        elif db_conn == "sqlite":
            sqlite_db = project_path / "database" / "database.sqlite"
            if not sqlite_db.exists():
                checks.append(
                    DiagnosticCheck(
                        id="db_sqlite_file_missing",
                        name="SQLite Database File",
                        category=CheckCategory.DATABASE,
                        status=CheckStatus.WARNING,
                        severity=Severity.WARNING,
                        title="database.sqlite File Does Not Exist",
                        explanation="Project is configured for SQLite, but 'database/database.sqlite' does not exist yet. Laravel will fail to migrate until this file is created.",
                        remediation="Touch 'database/database.sqlite' and ensure write permissions for the web server.",
                        auto_fixable=True,
                    )
                )
            else:
                checks.append(
                    DiagnosticCheck(
                        id="db_sqlite_file_present",
                        name="SQLite Database File",
                        category=CheckCategory.DATABASE,
                        status=CheckStatus.PASSED,
                        severity=Severity.INFO,
                        title="database.sqlite File Found",
                        explanation="SQLite database file is present in the database directory.",
                        remediation="Ensure this file is stored on a persistent volume mount so data persists across restarts.",
                    )
                )

        # 4. Check Migrations Directory
        migrations_dir = project_path / "database" / "migrations"
        if not migrations_dir.is_dir():
            checks.append(
                DiagnosticCheck(
                    id="db_migrations_missing_dir",
                    name="Database Migrations",
                    category=CheckCategory.DATABASE,
                    status=CheckStatus.WARNING,
                    severity=Severity.WARNING,
                    title="database/migrations Directory Not Found",
                    explanation="No migrations folder was found. The application may be using an imported SQL dump instead of standard Laravel migrations.",
                    remediation="Use standard Laravel migrations or ensure database tables are created prior to traffic.",
                )
            )
        else:
            migration_files = list(migrations_dir.glob("*.php"))
            if not migration_files:
                checks.append(
                    DiagnosticCheck(
                        id="db_migrations_empty",
                        name="Database Migrations",
                        category=CheckCategory.DATABASE,
                        status=CheckStatus.WARNING,
                        severity=Severity.WARNING,
                        title="Zero Migration Files Detected",
                        explanation="database/migrations is present but contains 0 PHP migration files.",
                        remediation="Add database migration files to auto-build database schema on deployment.",
                    )
                )
            else:
                checks.append(
                    DiagnosticCheck(
                        id="db_migrations_found",
                        name="Database Migrations",
                        category=CheckCategory.DATABASE,
                        status=CheckStatus.PASSED,
                        severity=Severity.INFO,
                        title=f"{len(migration_files)} Migration Files Found",
                        explanation=f"Found {len(migration_files)} schema migrations ready to be applied on deployment.",
                        remediation="Migrations will be executed during automated container boot.",
                        metadata={"count": len(migration_files)},
                    )
                )

        return checks
