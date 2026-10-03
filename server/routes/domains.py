"""
Custom Domain & Edge SSL Router
===============================
Endpoints for adding, verifying, and managing Bring-Your-Own-Domains.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from server.orchestrator.domains import domain_manager

router = APIRouter(prefix="/api/domains", tags=["Custom Domains & SSL"])


class AddDomainRequest(BaseModel):
    domain: str
    tunnel_url: str = ""


@router.get("/{project_id}")
async def list_custom_domains(project_id: str):
    """Retrieve all custom domains configured for this project."""
    domains = domain_manager.get_domains(project_id)
    return {
        "project_id": project_id,
        "total": len(domains),
        "domains": domains,
    }


@router.post("/{project_id}")
async def add_custom_domain(project_id: str, req: AddDomainRequest):
    """Register a new custom domain and compute CNAME target."""
    try:
        new_entry = domain_manager.add_domain(project_id, req.domain, req.tunnel_url)
        return {
            "status": "CREATED",
            "message": f"Domain '{req.domain}' registered successfully.",
            "domain": new_entry,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/{domain}/verify")
async def verify_custom_domain(project_id: str, domain: str):
    """Perform real-time DNS lookup to verify CNAME configuration."""
    try:
        result = domain_manager.verify_domain(project_id, domain)
        return {
            "status": "VERIFIED" if result["status"] == "ACTIVE" else "PENDING",
            "domain": result,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


class RemoveDomainRequest(BaseModel):
    domain: str


@router.delete("/{project_id}/{domain:path}")
async def remove_custom_domain(project_id: str, domain: str):
    """Delete a custom domain mapping."""
    clean_domain = domain.strip().lower()
    removed = domain_manager.remove_domain(project_id, clean_domain)
    if not removed:
        raise HTTPException(status_code=404, detail="Domain not found.")
    return {"status": "DELETED", "message": f"Domain '{clean_domain}' removed."}


@router.post("/{project_id}/remove")
async def remove_custom_domain_post(project_id: str, req: RemoveDomainRequest):
    """Delete a custom domain mapping via POST fallback."""
    clean_domain = req.domain.strip().lower()
    removed = domain_manager.remove_domain(project_id, clean_domain)
    if not removed:
        raise HTTPException(status_code=404, detail="Domain not found.")
    return {"status": "DELETED", "message": f"Domain '{clean_domain}' removed."}
