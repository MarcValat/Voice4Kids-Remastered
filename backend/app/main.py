import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.api.extraction import router as extraction_router
from app.api.tts import router as tts_router
from app.api.voices import router as voices_router
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.middleware import MaxBodySizeMiddleware
from app.services.queue import close_redis_pool, get_redis_pool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        {"detail": "Trop de requêtes, réessaie dans un instant."}, status_code=429
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await get_redis_pool()
    yield
    await close_redis_pool()


def create_app() -> FastAPI:
    app = FastAPI(title="Voice4Kids API", version="1.0.0", lifespan=lifespan)

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[get_settings().frontend_origin],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(MaxBodySizeMiddleware)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(tts_router)
    app.include_router(extraction_router)
    app.include_router(voices_router)

    return app


app = create_app()
