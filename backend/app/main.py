from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.extraction import router as extraction_router
from app.api.tts import router as tts_router
from app.services.tts import tts_service

FRONTEND_DEV_ORIGIN = "http://localhost:5173"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    tts_service.load()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Voice4Kids API", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[FRONTEND_DEV_ORIGIN],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(tts_router)
    app.include_router(extraction_router)

    return app


app = create_app()
