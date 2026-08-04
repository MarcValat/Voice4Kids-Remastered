.PHONY: up down build logs test lint

up: ## Build and start the full stack (redis, api, worker, frontend)
	docker compose up -d --build

down: ## Stop and remove the stack
	docker compose down

build: ## Rebuild images without starting the stack
	docker compose build

logs: ## Follow logs for all services
	docker compose logs -f

test: ## Run backend and frontend test suites
	cd backend && uv run pytest -q
	cd frontend && npm test

lint: ## Lint backend and frontend
	cd backend && uvx ruff check app/ tests/
	cd frontend && npm run lint && npx tsc -b --noEmit
