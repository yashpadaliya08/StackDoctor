import argparse
import sys
from pathlib import Path
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from doctor.engine import DoctorEngine
from doctor.models import CheckStatus, DiagnosticReport, Severity


if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

console = Console(file=sys.stdout)


def render_report(report: DiagnosticReport) -> None:
    # 1. Header Banner
    console.print()
    console.print(
        Panel(
            Text("[+] Laravel Doctor — Deployment Readiness Engine", justify="center", style="bold cyan"),
            box=box.DOUBLE_EDGE,
            style="cyan",
        )
    )

    # 2. Metadata & Health Score Summary
    score = report.readiness_score
    if score >= 90:
        score_color = "bold green"
        score_badge = f"[{score_color}]{score} / 100  (EXCELLENT)[/{score_color}]"
    elif score >= 70:
        score_color = "bold yellow"
        score_badge = f"[{score_color}]{score} / 100  (GOOD / FIXES AVAILABLE)[/{score_color}]"
    elif score >= 50:
        score_color = "bold dark_orange"
        score_badge = f"[{score_color}]{score} / 100  (NEEDS ATTENTION)[/{score_color}]"
    else:
        score_color = "bold red"
        score_badge = f"[{score_color}]{score} / 100  (CRITICAL BLOCKERS)[/{score_color}]"

    meta = report.metadata
    meta_table = Table(show_header=False, box=box.SIMPLE)
    meta_table.add_column("Key", style="bold white")
    meta_table.add_column("Value", style="cyan")
    meta_table.add_column("Key2", style="bold white")
    meta_table.add_column("Value2", style="cyan")

    meta_table.add_row(
        "Framework:", f"Laravel {meta.framework_version or 'Unknown'}",
        "PHP Runtime:", f"{meta.resolved_php_version} (Req: {meta.php_requirement or 'None'})",
    )
    meta_table.add_row(
        "Database:", f"{meta.db_connection.upper()}",
        "Asset Bundler:", f"{meta.asset_bundler or 'None'} (Manifest: {'Yes' if meta.has_vite_manifest else 'Missing'})",
    )
    meta_table.add_row(
        "Storage Symlink:", "Present" if meta.has_storage_link else "Missing",
        "Directory Layout:", "Insecure Root index.php" if meta.is_cpanel_mangled else "Standard (public/)",
    )

    console.print(Panel(meta_table, title="🔍 Project Architecture Detected", border_style="blue"))

    # Score Panel
    console.print(
        Panel(
            Text.from_markup(f"Readiness Score: {score_badge}\n[dim]{report.summary}[/dim]"),
            title="📊 Deployment Readiness Score",
            border_style=score_color.split()[-1],
        )
    )
    console.print()

    # 3. Diagnostic Checks Table
    table = Table(
        title="📋 Diagnostic Inspection Results",
        header_style="bold magenta",
        box=box.ROUNDED,
        expand=True,
    )
    table.add_column("Status", width=10, justify="center")
    table.add_column("Category", width=14, style="dim")
    table.add_column("Diagnostic Check", style="bold white")
    table.add_column("Finding & Impact", style="white")
    table.add_column("Auto-Fix", width=10, justify="center")

    for check in report.checks:
        if check.status == CheckStatus.PASSED:
            status_text = Text("✔ PASS", style="bold green")
        elif check.status == CheckStatus.WARNING:
            status_text = Text("⚠ WARN", style="bold yellow")
        else:
            status_text = Text("✖ FAIL", style="bold red")

        fixable_text = Text("Available", style="cyan") if check.auto_fixable and check.status != CheckStatus.PASSED else Text("—", style="dim")

        table.add_row(
            status_text,
            check.category.value,
            check.title,
            check.explanation,
            fixable_text,
        )

    console.print(table)
    console.print()

    # 4. Actionable Next Steps
    if report.available_fixes:
        console.print(
            Panel(
                Text.from_markup(
                    f"[bold yellow]Found {len(report.available_fixes)} auto-fixable item(s)![/bold yellow]\n"
                    "Run the following command to automatically generate production .env, APP_KEY, Dockerfile, and Caddyfile:\n\n"
                    f"  [bold green]python -m doctor fix \"{report.project_path}\"[/bold green]"
                ),
                title="💡 Quick Remediation Available",
                border_style="yellow",
            )
        )
    else:
        console.print("[bold green]✨ All checks passed! Your application is ready for production deployment.[/bold green]")
    console.print()


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="doctor",
        description="Laravel Doctor — Automated Diagnostic & Fix Engine for Laravel Projects",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Scan command
    scan_parser = subparsers.add_parser("scan", help="Scan a Laravel directory, ZIP file, or Git repository")
    scan_parser.add_argument("source", help="Path to project directory, .zip archive, or git repository URL")
    scan_parser.add_argument("--json", action="store_true", help="Output machine-readable JSON report")

    # Fix command
    fix_parser = subparsers.add_parser("fix", help="Automatically repair detected issues and generate deployment files")
    fix_parser.add_argument("path", help="Path to project directory")
    fix_parser.add_argument("--app-url", default="https://app.studentapp.dev", help="Production APP_URL to configure")
    fix_parser.add_argument("--db-host", default="mysql-internal", help="Database host to configure in .env")
    fix_parser.add_argument("--no-docker", action="store_true", help="Skip generating Dockerfile and Caddyfile")

    args = parser.parse_args()
    engine = DoctorEngine()

    if args.command == "scan":
        try:
            report = engine.analyze(args.source)
            if args.json:
                print(report.model_dump_json(indent=2))
            else:
                render_report(report)
                if report.failed_count > 0:
                    sys.exit(1)
        except Exception as e:
            console.print(f"[bold red]Error analyzing project:[/bold red] {e}")
            sys.exit(2)

    elif args.command == "fix":
        try:
            path = Path(args.path)
            if not path.is_dir():
                console.print(f"[bold red]Error:[/bold red] Directory '{args.path}' does not exist.")
                sys.exit(1)

            actions = engine.apply_fixes(
                path,
                target_app_url=args.app_url,
                target_db_host=args.db_host,
                generate_docker=not args.no_docker,
            )

            console.print(f"\n[bold green]Successfully applied {len(actions)} fix(es):[/bold green]")
            for act in actions:
                console.print(f"  ✔ [{act.action_type}] [cyan]{act.target_file}[/cyan]: {act.description}")
            console.print("\n[bold green]🎉 Your project has been prepared for production deployment![/bold green]\n")

        except Exception as e:
            console.print(f"[bold red]Error applying fixes:[/bold red] {e}")
            sys.exit(2)


if __name__ == "__main__":
    main()
