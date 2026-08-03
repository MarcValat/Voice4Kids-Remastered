from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

FRONTEND_DEV_ORIGIN = "http://localhost:5173"


def create_app() -> FastAPI:
    app = FastAPI(title="Voice4Kids API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[FRONTEND_DEV_ORIGIN],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
