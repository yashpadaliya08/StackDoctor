from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class CheckStatus(str, Enum):
    PASSED = "PASSED"
    WARNING = "WARNING"
    FAILED = "FAILED"


class CheckCategory(str, Enum):
    RUNTIME = "RUNTIME"
    ENVIRONMENT = "ENVIRONMENT"
    DATABASE = "DATABASE"
    ASSETS = "ASSETS"
    STORAGE = "STORAGE"
    SECURITY = "SECURITY"


class Severity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class DiagnosticCheck(BaseModel):
    id: str = Field(..., description="Unique check identifier, e.g. env_app_key")
    name: str = Field(..., description="Short human-readable check name")
    category: CheckCategory = Field(..., description="Functional category")
    status: CheckStatus = Field(..., description="Execution status")
    severity: Severity = Field(..., description="Impact severity if failed")
    title: str = Field(..., description="Plain-English headline of finding")
    explanation: str = Field(..., description="Why this check matters and what was detected")
    remediation: str = Field(..., description="Step-by-step or automated solution")
    auto_fixable: bool = Field(default=False, description="Whether the doctor can fix this automatically")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary context data")


class ProjectMetadata(BaseModel):
    stack: str = Field(default="php", description="Detected technology stack: php, python, node, etc.")
    framework: str = Field(default="Laravel", description="Target framework")
    framework_version: Optional[str] = Field(default=None, description="Detected Laravel version (e.g. 11.2)")
    detected_entrypoint: Optional[str] = Field(default=None, description="Primary executable entrypoint")
    framework_details: dict[str, Any] = Field(default_factory=dict, description="Framework detector details")
    php_requirement: Optional[str] = Field(default=None, description="PHP constraint from composer.json")
    resolved_php_version: str = Field(default="8.3", description="Recommended runtime image PHP version")
    db_connection: str = Field(default="mysql", description="Primary database driver: mysql, sqlite, pgsql")
    asset_bundler: Optional[str] = Field(default=None, description="vite, laravel-mix, or none")
    has_vite_manifest: bool = Field(default=False, description="Whether public/build/manifest.json exists")
    has_storage_link: bool = Field(default=False, description="Whether public/storage symlink exists")
    is_cpanel_mangled: bool = Field(default=False, description="Whether index.php was moved to project root")
    detected_env: dict[str, str] = Field(default_factory=dict, description="Environment variables detected from .env or .env.example")


class FixAction(BaseModel):
    check_id: str
    action_type: str  # e.g. "create_file", "modify_file", "restore_path"
    target_file: str
    description: str
    diff_or_content: Optional[str] = None


class DiagnosticReport(BaseModel):
    project_path: str = Field(..., description="Path or source of inspected project")
    timestamp: str = Field(..., description="ISO timestamp of analysis")
    readiness_score: int = Field(..., ge=0, le=100, description="Overall readiness score (0-100)")
    metadata: ProjectMetadata = Field(..., description="Extracted project configuration")
    checks: list[DiagnosticCheck] = Field(default_factory=list, description="All diagnostic findings")
    passed_count: int = Field(default=0)
    warning_count: int = Field(default=0)
    failed_count: int = Field(default=0)
    auto_fixable_count: int = Field(default=0)
    summary: str = Field(default="", description="High-level narrative summary of health")
    available_fixes: list[FixAction] = Field(default_factory=list, description="List of proposed fixes")
