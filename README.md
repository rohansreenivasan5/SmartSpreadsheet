# SmartSpreadsheet

A minimal spreadsheet-like app that fans out per-cell AI tasks using a Go HTTP API + Redis Streams, and displays results in a simple web UI.

## Architecture
- Go API (Gin) + Redis worker (port 8080)
- Redis (streams + hashes) (port 6379)
- Frontend (static, served by nginx) (port 3000)

## Prerequisites
- Docker & Docker Compose
- OpenAI API key

## Quick Start
```bash
cp env.template .env                 # add OPENAI_API_KEY (and optional OPENAI_MODEL)
docker-compose up --build -d         # start redis, go-api, frontend
```

Open:
- Frontend: http://localhost:3000
- Go API: http://localhost:8080

## Endpoints
- `GET /health` – Go API health
- `GET /api/v1/redis/test` – Redis connectivity
- `POST /api/v1/autofill` – body: `{ rows: string[], cols: string[] }`
- `GET /api/v1/autofill/:id/status` – returns results map

## How it works
1) Frontend sends `{rows, cols}` to `POST /api/v1/autofill`.
2) Go API enqueues one job per `(row, col)` to a Redis stream.
3) Worker consumes jobs, calls OpenAI directly, and stores results in a Redis hash `autofill:<id>:results`.
4) Frontend polls `GET /api/v1/autofill/:id/status` to display results as they arrive.

## Health Checks
```bash
curl -s http://localhost:8080/health && echo
curl -s http://localhost:8080/api/v1/redis/test && echo
```

## Environment (.env)
```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-3.5-turbo   # optional
OPENAI_TEMPERATURE=0.2       # optional
REDIS_ADDR=redis:6379
```

## Dev Tips
- Rebuild a service: `docker-compose build go-api && docker-compose up -d go-api`
- Tail logs: `docker-compose logs -f go-api | cat`

## Notes
- Results are short by design (prompts end with “Answer briefly”).
- Rows auto-expand in the UI to fit multi-line content. 