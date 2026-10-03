from fastapi import APIRouter
from server.orchestrator.driver import PhoneRemoteDriver

router = APIRouter(prefix="/api/phone", tags=["Phone Server"])


@router.get("/capabilities")
async def get_phone_capabilities() -> dict:
    """
    Probes the spare Android phone over SSH to report installed runtimes,
    package versions (PHP, Composer, Python, Pip, Node, NPM, MariaDB, Cloudflared),
    and ready-to-deploy technology stacks.
    """
    return PhoneRemoteDriver.get_phone_capabilities()


@router.get("/status")
async def get_phone_status() -> dict:
    """Returns quick online/offline status for the phone server."""
    online = PhoneRemoteDriver.is_online(host=PhoneRemoteDriver.DEFAULT_HOST, port=PhoneRemoteDriver.DEFAULT_PORT)
    return {
        "online": online,
        "host": PhoneRemoteDriver.DEFAULT_HOST,
        "port": PhoneRemoteDriver.DEFAULT_PORT,
    }
