# SmartSpreadsheet MVP

A local MVP that processes spreadsheets via Go HTTP API, fans out per-cell AI tasks using Redis Streams, and returns results via Redis hashes using a Python microservice for LangChain processing.

## Architecture

- **Go API Service**: Gin web server + Redis worker (port 8080)
- **Python Chain Runner**: FastAPI + LangChain + LangSmith (port 8000)  
- **Redis**: Streams for job distribution, hashes for results (port 6379)

## Prerequisites

- Docker and Docker Compose
- OpenAI API Key
- LangSmith API Key (optional, for tracing)

## Quick Start

1. **Clone and setup environment:**
   ```bash
   git clone <repository-url>
   cd SmartSpreadsheet
   cp .env.example .env
   ```

2. **Configure environment variables in `.env`:**
   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   LANGSMITH_API_KEY=your_langsmith_api_key_here
   ```

3. **Start all services:**
   ```bash
   docker-compose up --build -d
   ```

4. **Verify services are running:**
   ```bash
   docker-compose ps
   ```

5. **Run end-to-end test:**
   ```bash
   ./test-e2e.sh
   ```

## API Endpoints

### Go API Service (Port 8080)

- `GET /health` - Health check
- `GET /` - Service info
- `POST /api/v1/sheets/:sheetId/run` - Submit spreadsheet for processing
- `GET /api/v1/sheets/:sheetId/status` - Get processing results

### Chain Runner Service (Port 8000)

- `GET /health` - Health check
- `GET /` - Service info
- `POST /chain/run` - Execute LangChain chain

## End-to-End Test Flow

### 1. Submit a Spreadsheet for Processing

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "table": [
      ["", "Sales", "Revenue"],
      ["Q1", "100", "10000"],
      ["Q2", "150", "15000"],
      ["Q3", "200", "20000"]
    ]
  }' \
  http://localhost:8080/api/v1/sheets/test123/run
```

**Expected Response:**
```json
{
  "jobCount": 6,
  "message": "Sheet processing started",
  "sheetId": "test123",
  "status": "accepted"
}
```

### 2. Check Processing Status and Results

```bash
curl http://localhost:8080/api/v1/sheets/test123/status
```

**Expected Response:**
```json
{
  "results": {
    "1:2": "{\"result\":\"The cell value '100' appears to be a numerical value representing sales data...\",\"status\":\"completed\",\"timestamp\":1751152891,\"trace_id\":\"not-available\"}",
    "1:3": "{\"result\":\"The cell value '10000' represents a revenue figure...\",\"status\":\"completed\",\"timestamp\":1751152893,\"trace_id\":\"not-available\"}",
    "2:2": "{\"result\":\"The cell value '150' indicates an increase in sales...\",\"status\":\"completed\",\"timestamp\":1751152895,\"trace_id\":\"not-available\"}",
    "2:3": "{\"result\":\"The cell value '15000' represents revenue...\",\"status\":\"completed\",\"timestamp\":1751152897,\"trace_id\":\"not-available\"}",
    "3:2": "{\"result\":\"The cell value '200' shows continued growth...\",\"status\":\"completed\",\"timestamp\":1751152899,\"trace_id\":\"not-available\"}",
    "3:3": "{\"result\":\"The cell value '20000' represents the highest revenue...\",\"status\":\"completed\",\"timestamp\":1751152901,\"trace_id\":\"not-available\"}"
  }
}
```

## Complete End-to-End Test Script

```bash
#!/bin/bash

echo "🚀 Starting SmartSpreadsheet MVP End-to-End Test"
echo "================================================"

# Test 1: Health checks
echo "📋 Testing service health..."
curl -s http://localhost:8080/health | jq .
curl -s http://localhost:8000/health | jq .

# Test 2: Submit spreadsheet
echo ""
echo "📊 Submitting spreadsheet for processing..."
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "table": [
      ["", "Sales", "Revenue"],
      ["Q1", "100", "10000"],
      ["Q2", "150", "15000"],
      ["Q3", "200", "20000"]
    ]
  }' \
  http://localhost:8080/api/v1/sheets/e2e-test/run)

echo "Submit Response:"
echo $RESPONSE | jq .

# Test 3: Wait for processing
echo ""
echo "⏳ Waiting for AI processing (10 seconds)..."
sleep 10

# Test 4: Get results
echo ""
echo "📈 Retrieving AI-generated results..."
curl -s http://localhost:8080/api/v1/sheets/e2e-test/status | jq .

echo ""
echo "✅ End-to-End Test Complete!"
```

## How It Works

1. **Sheet Submission**: POST to `/api/v1/sheets/:sheetId/run` with spreadsheet data
2. **Job Creation**: Go API stores sheet data in Redis and creates jobs for each cell (excluding headers/labels)
3. **Job Processing**: Go worker reads jobs from Redis Streams and calls Python chain-runner
4. **AI Processing**: Python service runs LangChain chains with OpenAI LLM
5. **Result Storage**: Results are stored in Redis hashes with metadata
6. **Result Retrieval**: GET `/api/v1/sheets/:sheetId/status` returns all processed results

## Development

### Project Structure
```
SmartSpreadsheet/
├── README.md
├── PLAN.md
├── .env
├── .gitignore
├── docker-compose.yml
├── go-api/
│   ├── main.go          # API server + worker goroutine
│   ├── handlers.go      # HTTP handlers
│   ├── worker.go        # Redis stream processing
│   ├── redis.go         # Redis utilities
│   ├── go.mod
│   └── Dockerfile
└── chain-runner/
    ├── app.py           # FastAPI + LangChain service
    ├── requirements.txt
    └── Dockerfile
```

### Local Development

1. **Start services:**
   ```bash
   docker-compose up -d
   ```

2. **View logs:**
   ```bash
   docker-compose logs -f go-api
   docker-compose logs -f chain-runner
   ```

3. **Stop services:**
   ```bash
   docker-compose down
   ```

## Troubleshooting

### Common Issues

1. **404 errors from chain-runner**: Check `CHAIN_RUNNER_URL` in docker-compose.yml
2. **Redis connection errors**: Ensure Redis container is healthy
3. **Missing API keys**: Verify `.env` file has required keys

### Debug Commands

```bash
# Check service status
docker-compose ps

# View service logs
docker-compose logs go-api
docker-compose logs chain-runner

# Test Redis connectivity
docker-compose exec go-api curl http://localhost:8080/api/v1/redis/test

# Check Redis streams manually
docker-compose exec redis redis-cli XINFO STREAM sheet-jobs-stream
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for LLM access | Yes |
| `LANGSMITH_API_KEY` | LangSmith API key for tracing | No |
| `REDIS_ADDR` | Redis connection address | No (default: redis:6379) |
| `CHAIN_RUNNER_URL` | Chain runner service URL | No (default: http://chain-runner:8000) |

## License

MIT License 