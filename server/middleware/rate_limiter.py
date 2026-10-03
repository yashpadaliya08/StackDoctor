"""
Sliding Window Rate Limiter Middleware
======================================
Protects the platform API and ARM edge nodes from abusive traffic, scraping,
and Denial of Service (DoS) attacks using a sliding window algorithm.
"""

import threading
import time
from collections import defaultdict
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class SlidingWindowRateLimiter:
    """Thread-safe sliding window rate tracker per client IP with automatic stale IP eviction."""

    def __init__(self, max_requests: int = 120, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.clients: dict[str, list[float]] = defaultdict(list)
        self.blocked_total = 0
        self._lock = threading.Lock()
        self._last_cleanup = time.time()

    def _periodic_cleanup(self, now: float, window_start: float) -> None:
        """Evict stale client IPs to prevent unbounded memory growth."""
        if now - self._last_cleanup < 60 and len(self.clients) < 500:
            return
        self._last_cleanup = now
        stale_ips = [
            ip for ip, timestamps in self.clients.items()
            if not timestamps or timestamps[-1] <= window_start
        ]
        for ip in stale_ips:
            self.clients.pop(ip, None)

    def is_allowed(self, client_ip: str) -> tuple[bool, int, int]:
        now = time.time()
        window_start = now - self.window_seconds

        with self._lock:
            self._periodic_cleanup(now, window_start)

            # Prune timestamps outside the current sliding window
            timestamps = [ts for ts in self.clients[client_ip] if ts > window_start]

            if not timestamps and client_ip in self.clients:
                # If no recent timestamps, clear existing list
                self.clients[client_ip] = []

            remaining = max(0, self.max_requests - len(timestamps))
            if len(timestamps) < self.max_requests:
                timestamps.append(now)
                self.clients[client_ip] = timestamps
                return True, remaining, self.window_seconds
            else:
                self.clients[client_ip] = timestamps
                self.blocked_total += 1
                oldest = timestamps[0]
                retry_after = max(1, int(self.window_seconds - (now - oldest)))
                return False, 0, retry_after

    def get_stats(self) -> dict:
        now = time.time()
        window_start = now - self.window_seconds
        with self._lock:
            active_ips = sum(1 for ts in self.clients.values() if any(t > window_start for t in ts))
            return {
                "max_requests_per_min": self.max_requests,
                "window_seconds": self.window_seconds,
                "active_client_ips": active_ips,
                "blocked_requests_total": self.blocked_total,
                "status": "ENFORCING",
            }


# Global singleton instance
rate_limiter = SlidingWindowRateLimiter(max_requests=150, window_seconds=60)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path

        # Exempt health checks, static assets, and SSE event streaming endpoints
        if (
            path in ("/api/health", "/", "/live")
            or path.startswith("/assets")
            or path.startswith("/vite")
            or "/stream" in path
            or "/logs" in path
        ):
            return await call_next(request)

        client_ip = request.client.host if request.client else "127.0.0.1"
        allowed, remaining, retry_or_window = rate_limiter.is_allowed(client_ip)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too Many Requests",
                    "detail": f"Rate limit exceeded ({rate_limiter.max_requests} req/min). Please slow down.",
                    "retry_after_seconds": retry_or_window,
                },
                headers={
                    "Retry-After": str(retry_or_window),
                    "X-RateLimit-Limit": str(rate_limiter.max_requests),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response: Response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(rate_limiter.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
