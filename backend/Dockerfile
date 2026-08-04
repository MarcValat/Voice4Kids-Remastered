FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app

# torch is pinned to a CUDA build in pyproject.toml (for local GPU dev).
# Choose which build ends up in this image with --build-arg TORCH_VARIANT=
#   cpu (default) — smaller image, no GPU required, works anywhere.
#   gpu            — CUDA build; needs an NVIDIA GPU + nvidia-container-toolkit
#                     on the host (docker run --gpus all, or the compose
#                     deploy.resources.reservations.devices equivalent).
# Either way the app auto-detects at runtime (torch.cuda.is_available()) and
# falls back to CPU if no GPU is actually present — TORCH_VARIANT only
# decides which torch build (and how much of the CUDA runtime) gets baked
# into the image in the first place.
ARG TORCH_VARIANT=cpu
ENV UV_CPU_TORCH_FLAGS="--no-install-package torch --no-install-package triton --no-install-package cuda-bindings --no-install-package cuda-pathfinder --no-install-package cuda-toolkit --no-install-package nvidia-cublas-cu12 --no-install-package nvidia-cuda-cupti-cu12 --no-install-package nvidia-cuda-nvrtc-cu12 --no-install-package nvidia-cuda-runtime-cu12 --no-install-package nvidia-cudnn-cu12 --no-install-package nvidia-cufft-cu12 --no-install-package nvidia-cufile-cu12 --no-install-package nvidia-curand-cu12 --no-install-package nvidia-cusolver-cu12 --no-install-package nvidia-cusparse-cu12 --no-install-package nvidia-cusparselt-cu12 --no-install-package nvidia-nccl-cu12 --no-install-package nvidia-nvjitlink-cu12 --no-install-package nvidia-nvshmem-cu12 --no-install-package nvidia-nvtx-cu12"

# Dependencies first, separate from application code, so this (slow) layer
# is only rebuilt when pyproject.toml/uv.lock actually change.
COPY pyproject.toml uv.lock ./
RUN if [ "$TORCH_VARIANT" = "cpu" ]; then \
        uv sync --locked --no-install-project $UV_CPU_TORCH_FLAGS ; \
    else \
        uv sync --locked --no-install-project ; \
    fi

COPY app ./app
# `uv pip install torch` must be the very last uv-related step: any later
# `uv sync --no-install-package torch` doesn't just skip installing it, it
# actively enforces torch's absence and would uninstall it again.
RUN if [ "$TORCH_VARIANT" = "cpu" ]; then \
        uv sync --locked $UV_CPU_TORCH_FLAGS \
        && uv pip install torch --index-url https://download.pytorch.org/whl/cpu ; \
    else \
        uv sync --locked ; \
    fi

ENV PATH="/app/.venv/bin:$PATH"

# Shared by both the api and worker services (docker-compose overrides CMD
# for the worker) — same image, same dependencies either way.
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
