"""
StackDoctor Legacy Driver Facade.
Provides 100% backwards compatibility for existing imports while delegating to
the new modular drivers under `server.orchestrator.drivers.*`.
"""

from server.orchestrator.drivers.base import (
    BaseDriver,
    SimulationDriver,
    compile_frontend_if_needed as _compile_frontend_if_needed,
)
from server.orchestrator.drivers.docker import DockerDriver
from server.orchestrator.drivers.local import LocalRunnerDriver
from server.orchestrator.drivers.phone import PhoneRemoteDriver

__all__ = [
    "BaseDriver",
    "SimulationDriver",
    "LocalRunnerDriver",
    "DockerDriver",
    "PhoneRemoteDriver",
    "_compile_frontend_if_needed",
]
