# SmartSpreadsheet MVP - Implementation Plan

## Overview
Build a local MVP that processes spreadsheets via Go HTTP API, fans out per-cell AI tasks using Redis Streams, and returns results via Redis hashes using a Python microservice for LangChain processing.

## Architecture
- **Go API Service**: Gin web server + Redis worker (port 8080)
- **Python Chain Runner**: FastAPI + LangChain + LangSmith (port 8000)
- **Redis**: Streams for job distribution, hashes for results (port 6379)

KEYS: 



## Phase 1: Project Setup & Infrastructure

### Step 1.1: Create Project Structure ✅
- [x] Create directory structure
- [x] Initialize git repository


### Step 1.2: Docker Environment Setup ✅
- [x] Create docker-compose.yml
- [x] Create .env template
- [x] Test basic Docker setup

### Step 1.3: Redis Service Setup ✅
- [x] Configure Redis service in docker-compose
- [x] Test Redis connectivity
- [x] Verify Redis streams functionality

## Phase 2: Python Chain Runner Service

### Step 2.1: Basic FastAPI Setup ✅
- [x] Create chain-runner/ directory
- [x] Create requirements.txt
- [x] Create basic FastAPI app structure
- [x] Test FastAPI service startup

### Step 2.2: LangChain Integration ✅
- [x] Install and configure LangChain
- [x] Set up OpenAI integration
- [x] Create PromptTemplate functionality
- [x] Test basic chain execution

### Step 2.3: LangSmith Integration
- [ ] Configure LangSmith tracing
- [ ] Add trace_id to responses
- [ ] Test tracing functionality

### Step 2.4: API Endpoint Implementation ✅
- [x] Implement POST /chain/run endpoint
- [x] Add input validation
- [x] Test endpoint with sample data
- [x] Verify response format

## Phase 3: Go API Service

### Step 3.1: Basic Go Project Setup ✅
- [x] Create go-api/ directory
- [x] Initialize Go module
- [x] Create go.mod and go.sum
- [x] Set up basic project structure

### Step 3.2: Gin Web Server Setup ✅
- [x] Install Gin framework
- [x] Create basic HTTP server
- [x] Set up routing structure
- [x] Test server startup

### Step 3.3: Redis Integration ✅
- [x] Install Redis Go client
- [x] Create Redis connection utilities
- [x] Test Redis connectivity from Go
- [x] Implement basic Redis operations

### Step 3.4: API Handlers Implementation
- [ ] Implement POST /api/v1/sheets/:sheetId/run
- [ ] Add JSON parsing and validation
- [ ] Implement Redis data storage
- [ ] Add job stream creation
- [ ] Test endpoint with sample data

### Step 3.5: Status Endpoint Implementation
- [ ] Implement GET /api/v1/sheets/:sheetId/status
- [ ] Add Redis hash retrieval
- [ ] Format response JSON
- [ ] Test status endpoint

## Phase 4: Go Worker Implementation

### Step 4.1: Redis Streams Setup ✅
- [x] Create consumer group on startup
- [x] Implement stream reading logic
- [x] Test stream message processing
- [x] Verify group creation

### Step 4.2: Worker Loop Implementation ✅
- [x] Implement XREADGROUP loop
- [x] Add message parsing logic
- [x] Test worker message consumption
- [x] Verify stream processing

### Step 4.3: Chain Runner Integration
- [ ] Implement HTTP client for chain-runner
- [ ] Add request/response handling
- [ ] Test microservice communication
- [ ] Verify result processing

### Step 4.4: Result Storage
- [ ] Implement Redis hash storage
- [ ] Add message acknowledgment
- [ ] Test end-to-end processing
- [ ] Verify result persistence

## Phase 5: Integration & Testing

### Step 5.1: End-to-End Testing
- [ ] Test complete workflow
- [ ] Verify data flow through all components
- [ ] Test error handling
- [ ] Validate response formats

## Phase 6: Frontend Development

### Overview
Create a simple, single-page web interface that allows users to:
- Upload/paste spreadsheet data
- Submit for AI processing
- View real-time processing status
- Display AI-generated results in a readable format

### Step 6.1: Frontend Architecture & Setup
- [ ] Create `frontend/` directory structure
- [ ] Set up React/Vue.js or vanilla HTML/CSS/JS
- [ ] Create basic HTML layout with modern CSS
- [ ] Add responsive design for mobile/desktop
- [ ] Set up development server and build process

**Technical Decisions:**
- **Framework**: Vanilla HTML/CSS/JS for simplicity (no build complexity)
- **Styling**: Modern CSS with Flexbox/Grid, minimal dependencies
- **State Management**: Simple JavaScript state management
- **API Integration**: Fetch API for backend communication

### Step 6.2: Core UI Components
- [ ] **Header**: Title, description, and status indicator
- [ ] **Input Section**: 
  - Text area for pasting CSV/table data
  - File upload option for CSV files
  - "Sample Data" button for quick testing
  - Data preview/validation
- [ ] **Submit Section**: 
  - Submit button with loading states
  - Job count display
  - Processing progress indicator
- [ ] **Results Section**: 
  - Results table/grid display
  - Cell-by-cell AI insights
  - Export functionality
  - Refresh button

### Step 6.3: Data Input & Validation
- [ ] Implement CSV parsing (handle comma/tab separated)
- [ ] Add table data validation (check for empty cells, malformed data)
- [ ] Create data preview component (show parsed table)
- [ ] Add input sanitization and error handling
- [ ] Implement "Sample Data" feature with predefined spreadsheets

**Sample Data Examples:**
```csv
,Sales,Revenue,Profit
Q1,100,10000,2000
Q2,150,15000,3000
Q3,200,20000,4000
```

### Step 6.4: API Integration
- [ ] Create API client functions (submit, status, health)
- [ ] Implement polling for status updates (every 2-3 seconds)
- [ ] Add error handling for network issues
- [ ] Create loading states and progress indicators
- [ ] Handle API rate limiting and timeouts

**API Flow:**
1. User submits data → POST `/api/v1/sheets/:id/run`
2. Show "Processing..." with job count
3. Poll GET `/api/v1/sheets/:id/status` every 2-3 seconds
4. Display results as they complete
5. Show completion status

### Step 6.5: Results Display
- [ ] Create results table component
- [ ] Parse JSON results and display in readable format
- [ ] Add cell highlighting for completed vs pending results
- [ ] Implement result filtering and search
- [ ] Add copy-to-clipboard functionality
- [ ] Create export options (CSV, JSON)

**Results Format:**
- Show original cell value
- Display AI analysis in readable text
- Include processing timestamp
- Show completion status

### Step 6.6: User Experience Enhancements
- [ ] Add toast notifications for success/error states
- [ ] Implement keyboard shortcuts (Ctrl+Enter to submit)
- [ ] Add auto-save of input data to localStorage
- [ ] Create responsive design for mobile devices
- [ ] Add dark/light theme toggle
- [ ] Implement accessibility features (ARIA labels, keyboard navigation)

### Step 6.7: Error Handling & Edge Cases
- [ ] Handle network connectivity issues
- [ ] Add retry mechanisms for failed requests
- [ ] Implement graceful degradation
- [ ] Add user-friendly error messages
- [ ] Handle large datasets (show progress, pagination)
- [ ] Add input validation feedback

### Step 6.8: Integration & Testing
- [ ] Test with various data formats and sizes
- [ ] Verify responsive design across devices
- [ ] Test error scenarios and edge cases
- [ ] Validate accessibility compliance
- [ ] Performance testing with large datasets
- [ ] Cross-browser compatibility testing

## Success Criteria
- [ ] `docker-compose up --build` starts all services successfully
- [ ] `curl -X POST /api/v1/sheets/42/run` with valid JSON returns 202
- [ ] `curl GET /api/v1/sheets/42/status` returns AI-generated results
- [ ] All components communicate via Redis streams and hashes
- [ ] LangSmith tracing is functional
- [ ] Frontend provides intuitive spreadsheet upload and result viewing
- [ ] Real-time status updates work correctly
- [ ] Results are displayed in a user-friendly format

## File Structure (Final)
```
SmartSpreadsheet/
├── PLAN.md
├── README.md
├── .env
├── .gitignore
├── docker-compose.yml
├── test-e2e.sh
├── go-api/
│   ├── main.go
│   ├── go.mod
│   ├── handlers.go
│   ├── worker.go
│   ├── redis.go
│   └── Dockerfile
├── chain-runner/
│   ├── app.py
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── api.js
    └── Dockerfile
```

## Testing Checklist for Each Step
- [ ] Docker containers start successfully
- [ ] Services can communicate with each other
- [ ] Redis is accessible from all services
- [ ] API endpoints accept and return correct data
- [ ] Worker processes stream messages
- [ ] Chain runner executes LangChain chains
- [ ] Complete workflow functions end-to-end 