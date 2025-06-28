# SmartSpreadsheet MVP

A local MVP that processes spreadsheets via Go HTTP API, fans out per-cell AI tasks using Redis Streams, and returns results via Redis hashes using a Python microservice for LangChain processing.

## 🏗️ Architecture

- **Go API Service**: Gin web server + Redis worker (port 8080)
- **Python Chain Runner**: FastAPI + LangChain + LangSmith (port 8000)  
- **Redis**: Streams for job distribution, hashes for results (port 6379)
- **Frontend**: Modern web interface with real-time updates (port 3000)

## 📋 Prerequisites

- Docker and Docker Compose
- OpenAI API Key
- LangSmith API Key (optional, for tracing)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <repository-url>
cd SmartSpreadsheet
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` file with your API keys:

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional (for LangSmith tracing)
LANGSMITH_API_KEY=your_langsmith_api_key_here
```

### 3. Start All Services

```bash
docker-compose up --build -d
```

### 4. Verify Services Are Running

```bash
docker-compose ps
```

You should see all services (redis, chain-runner, go-api, frontend) in "Up" status.

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Go API**: http://localhost:8080
- **Chain Runner**: http://localhost:8000
- **Redis**: localhost:6379

### 6. Test the Complete System

```bash
# Run automated end-to-end test
./test-e2e.sh

# Or run manual frontend test
./test-frontend-manual.sh
```

## 🖥️ Using the Frontend

### Quick Demo

1. **Open the frontend**: Navigate to http://localhost:3000
2. **Load sample data**: Click "📋 Load Sample Data" button
3. **Submit for processing**: Click "🚀 Process with AI" or press Ctrl+Enter
4. **Monitor progress**: Watch real-time job count and progress updates
5. **View results**: See AI-generated insights for each cell
6. **Copy results**: Click "📋 Copy" on any result to copy to clipboard
7. **Export all**: Click "📤 Export" to download results as JSON

### Features

- **Data Input**: Paste CSV data or upload CSV files
- **Real-time Preview**: See parsed data in a table format
- **Progress Tracking**: Live updates on processing status
- **Results Display**: Clean, organized AI insights
- **Copy/Export**: Easy sharing and downloading of results
- **Keyboard Shortcuts**: Ctrl+Enter to submit, Escape to clear
- **Auto-save**: Input data saved to browser storage
- **Responsive Design**: Works on desktop, tablet, and mobile

### Data Format

The frontend accepts CSV data in this format:

```csv
,Column1,Column2,Column3
Row1,Value1,Value2,Value3
Row2,Value4,Value5,Value6
```

## 🔧 API Endpoints

### Go API Service (Port 8080)

- `GET /health` - Health check
- `GET /` - Service info
- `GET /api/v1/redis/test` - Redis connectivity test
- `POST /api/v1/sheets/:sheetId/run` - Submit spreadsheet for processing
- `GET /api/v1/sheets/:sheetId/status` - Get processing results

### Chain Runner Service (Port 8000)

- `GET /health` - Health check
- `GET /` - Service info
- `POST /chain/run` - Execute LangChain chain

## 🧪 Testing

### Automated Testing

```bash
# Test the complete backend pipeline
./test-e2e.sh

# Test frontend functionality
./test-frontend.sh

# Manual testing guide
./test-frontend-manual.sh
```

### Manual Testing

1. **Test Backend Services**:
   ```bash
   curl http://localhost:8080/health
   curl http://localhost:8000/health
   curl http://localhost:8080/api/v1/redis/test
   ```

2. **Test Sheet Processing**:
   ```bash
   # Submit a sheet
   curl -X POST -H "Content-Type: application/json" \
     -d '{"table":[["","Sales","Revenue"],["Q1","100","10000"],["Q2","150","15000"]]}' \
     http://localhost:8080/api/v1/sheets/test123/run
   
   # Check results
   curl http://localhost:8080/api/v1/sheets/test123/status
   ```

3. **Test Frontend**: Open http://localhost:3000 and use the web interface

## 📁 Project Structure

```
SmartSpreadsheet/
├── README.md
├── PLAN.md
├── FRONTEND_SUMMARY.md
├── .env
├── .gitignore
├── docker-compose.yml
├── test-e2e.sh
├── test-frontend.sh
├── test-frontend-manual.sh
├── test-data.csv
├── go-api/
│   ├── main.go          # API server + worker goroutine
│   ├── handlers.go      # HTTP handlers
│   ├── worker.go        # Redis stream processing
│   ├── redis.go         # Redis utilities
│   ├── go.mod
│   └── Dockerfile
├── chain-runner/
│   ├── app.py           # FastAPI + LangChain service
│   ├── requirements.txt
│   └── Dockerfile
└── frontend/
    ├── index.html       # Main HTML structure
    ├── styles.css       # Modern CSS styling
    ├── app.js          # Main application logic
    ├── api.js          # API client functions
    ├── nginx.conf      # Nginx configuration
    └── Dockerfile
```

## 🔄 How It Works

1. **Frontend Input**: User uploads/pastes CSV data via web interface
2. **Sheet Submission**: Frontend sends data to Go API via POST `/api/v1/sheets/:sheetId/run`
3. **Job Creation**: Go API stores sheet data in Redis and creates jobs for each cell (excluding headers/labels)
4. **Job Processing**: Go worker reads jobs from Redis Streams and calls Python chain-runner
5. **AI Processing**: Python service runs LangChain chains with OpenAI LLM
6. **Result Storage**: Results are stored in Redis hashes with metadata
7. **Real-time Updates**: Frontend polls for results every 2 seconds
8. **Results Display**: AI-generated insights displayed in user-friendly format

## 🛠️ Development

### Local Development

1. **Start services**:
   ```bash
   docker-compose up -d
   ```

2. **View logs**:
   ```bash
   docker-compose logs -f go-api
   docker-compose logs -f chain-runner
   docker-compose logs -f frontend
   ```

3. **Rebuild services**:
   ```bash
   docker-compose build go-api
   docker-compose build chain-runner
   docker-compose build frontend
   ```

4. **Stop services**:
   ```bash
   docker-compose down
   ```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key for LLM processing |
| `LANGSMITH_API_KEY` | No | LangSmith API key for tracing (optional) |
| `REDIS_ADDR` | No | Redis address (default: redis:6379) |
| `CHAIN_RUNNER_URL` | No | Chain runner URL (default: http://chain-runner:8000) |

## 🐛 Troubleshooting

### Common Issues

1. **Services not starting**:
   ```bash
   docker-compose down
   docker-compose up --build -d
   ```

2. **API key issues**:
   - Ensure your `.env` file has the correct `OPENAI_API_KEY`
   - Check that the API key is valid and has sufficient credits

3. **Redis connection issues**:
   ```bash
   docker-compose logs redis
   ```

4. **Frontend not loading**:
   - Check if port 3000 is available
   - Verify nginx configuration in `frontend/nginx.conf`

5. **Processing not working**:
   ```bash
   docker-compose logs go-api
   docker-compose logs chain-runner
   ```

### Health Checks

```bash
# Check all services
curl http://localhost:8080/health
curl http://localhost:8000/health
curl http://localhost:3000/health

# Check Redis connectivity
curl http://localhost:8080/api/v1/redis/test
```

## 📊 Performance

- **Concurrent Processing**: Multiple sheets can be processed simultaneously
- **Real-time Updates**: Frontend polls for results every 2 seconds
- **Scalable Architecture**: Redis streams enable horizontal scaling
- **Efficient Storage**: Results stored with TTL for automatic cleanup

## 🔒 Security

- **API Key Protection**: Environment variables for sensitive data
- **Input Validation**: Server-side validation of all inputs
- **Error Handling**: Graceful handling of network and processing errors
- **CORS Configuration**: Proper cross-origin request handling

## 🚀 Production Deployment

For production deployment, consider:

1. **Environment Variables**: Use proper secret management
2. **SSL/TLS**: Add HTTPS termination
3. **Monitoring**: Add health checks and logging
4. **Scaling**: Configure Redis persistence and worker scaling
5. **Backup**: Implement data backup strategies

## 📝 License

This project is for demonstration purposes. Please ensure compliance with OpenAI's terms of service when using their API. 