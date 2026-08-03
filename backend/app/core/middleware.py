import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# Generous cap covering our largest legitimate upload (voice sample, 20 MB) with
# headroom. Rejects oversized requests before their body is read into memory.
MAX_BODY_SIZE_BYTES = 25 * 1024 * 1024


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None and int(content_length) > MAX_BODY_SIZE_BYTES:
            logger.warning(
                "Rejected oversized request: %s bytes from %s",
                content_length,
                request.client.host if request.client else "unknown",
            )
            return JSONResponse({"detail": "Requête trop volumineuse."}, status_code=413)
        return await call_next(request)
