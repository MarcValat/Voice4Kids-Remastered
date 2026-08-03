# Voice4Kids

Application web qui convertit des histoires (PDF ou DOCX) en audio narré en français, avec choix d'une voix preset ou clonage de sa propre voix.

## Architecture

- **Backend** : FastAPI (`backend/`), gère l'extraction de texte, l'API de synthèse et le clonage de voix.
- **Synthèse vocale** : [Kyutai Pocket TTS](https://huggingface.co/kyutai/pocket-tts), exécutée localement (aucun texte/audio envoyé à un service tiers).
- **File d'attente** : la génération audio tourne dans un worker [`arq`](https://arq-docs.helpmanual.io/) séparé (Redis), pour ne pas bloquer l'API et gérer plusieurs générations en parallèle. L'audio est streamé en temps réel vers le client via Redis Streams pendant qu'il se génère.
- **Frontend** : React + Vite + TypeScript (`frontend/`).

## Prérequis

- [uv](https://docs.astral.sh/uv/) (gestion des dépendances et de l'environnement Python)
- Node.js + npm
- Docker (pour Redis en local) — ou toute autre instance Redis accessible

## Installation

### 1. Redis

```bash
docker run -d -p 6379:6379 --name voice4kids-redis redis:7-alpine
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # renseigner HF_TOKEN si tu veux le clonage de voix (voir plus bas)
uv sync
```

### 3. Frontend

```bash
cd frontend
npm install
```

## Lancer le projet (développement)

Trois process à lancer en parallèle, en plus de Redis :

```bash
# Worker (génère l'audio, charge le modèle TTS au démarrage)
cd backend && uv run arq app.worker.WorkerSettings

# API
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && npm run dev
```

Le frontend est accessible sur `http://localhost:5173`, l'API sur `http://127.0.0.1:8000`.

## Clonage de voix (optionnel)

Nécessite un compte HuggingFace :

1. Accepter les conditions sur [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts).
2. Créer un token en lecture sur [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
3. Le renseigner dans `backend/.env` (`HF_TOKEN=...`).

Sans token, l'application fonctionne normalement avec les voix presets uniquement.

## Structure du projet

```
backend/
  app/
    api/        # routes FastAPI (extraction, tts, voices)
    core/       # config (.env), rate limiting, middleware
    services/   # logique métier (extraction, conversion audio, tts, queue)
    worker.py   # worker arq (génération audio)
    main.py     # point d'entrée FastAPI
frontend/
  src/
    App.tsx     # UI principale
```
