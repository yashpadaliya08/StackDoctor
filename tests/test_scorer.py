from doctor.engine import DoctorEngine


def test_scorer_clean_project(clean_laravel11_sqlite):
    """A clean, fully compliant Laravel 11 project should achieve a high score (> 90)."""
    engine = DoctorEngine()
    report = engine.analyze(clean_laravel11_sqlite)

    assert report.readiness_score >= 90
    assert report.failed_count == 0
    assert "Production Ready" in report.summary


def test_scorer_broken_project(broken_env_project):
    """A project with missing APP_KEY, debug mode, and localhost DB should have low score."""
    engine = DoctorEngine()
    report = engine.analyze(broken_env_project)

    assert report.readiness_score < 70
    assert report.failed_count > 0
    assert report.auto_fixable_count > 0


def test_scorer_mangled_cpanel_project(mangled_cpanel_project):
    """A cPanel mangled project should have penalty for root index.php exposure."""
    engine = DoctorEngine()
    report = engine.analyze(mangled_cpanel_project)

    assert report.metadata.is_cpanel_mangled
    assert any(c.id == "cpanel_mangled_root_index" for c in report.checks)
