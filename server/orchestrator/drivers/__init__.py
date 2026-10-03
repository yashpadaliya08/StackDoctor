"""
Modular Driver Architecture for StackDoctor Edge & Local Orchestration.
Supports:
- PhoneRemoteDriver: Native ARM64 Termux execution (15x faster than QEMU Docker on mobile)
- DockerDriver: Container runtime on Docker daemon
- LocalRunnerDriver: Bare-metal host PHP/Node execution
- SimulationDriver: Scale-to-zero test driver
"""

from .base import BaseDriver, SimulationDriver, compile_frontend_if_needed
from .docker import DockerDriver
from .local import LocalRunnerDriver
from .phone import PhoneRemoteDriver

__all__ = [
    "BaseDriver",
    "SimulationDriver",
    "LocalRunnerDriver",
    "DockerDriver",
    "PhoneRemoteDriver",
    "compile_frontend_if_needed",
]
