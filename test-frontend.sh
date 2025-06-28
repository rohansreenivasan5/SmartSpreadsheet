#!/bin/bash

# Frontend Test Script for SmartSpreadsheet
# Tests the complete frontend functionality

set -e

echo "🧪 Testing SmartSpreadsheet Frontend"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_status="$3"
    
    echo -e "\n${BLUE}Testing: ${test_name}${NC}"
    
    if eval "$test_command" > /dev/null 2>&1; then
        if [ "$expected_status" = "success" ]; then
            echo -e "  ${GREEN}✅ PASS${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "  ${RED}❌ FAIL (expected failure but got success)${NC}"
            ((TESTS_FAILED++))
        fi
    else
        if [ "$expected_status" = "failure" ]; then
            echo -e "  ${GREEN}✅ PASS (expected failure)${NC}"
            ((TESTS_PASSED++))
        else
            echo -e "  ${RED}❌ FAIL${NC}"
            ((TESTS_FAILED++))
        fi
    fi
}

# Function to check if service is running
check_service() {
    local service_name="$1"
    local port="$2"
    local endpoint="$3"
    
    echo -e "\n${YELLOW}Checking ${service_name}...${NC}"
    
    if curl -s -f "http://localhost:${port}${endpoint}" > /dev/null; then
        echo -e "  ${GREEN}✅ ${service_name} is running on port ${port}${NC}"
        return 0
    else
        echo -e "  ${RED}❌ ${service_name} is not running on port ${port}${NC}"
        return 1
    fi
}

# Function to test API endpoints
test_api_endpoint() {
    local endpoint="$1"
    local method="${2:-GET}"
    local data="${3:-}"
    local expected_status="${4:-200}"
    
    local curl_cmd="curl -s -o /dev/null -w '%{http_code}'"
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        curl_cmd="$curl_cmd -X POST -H 'Content-Type: application/json' -d '$data'"
    elif [ "$method" = "POST" ]; then
        curl_cmd="$curl_cmd -X POST"
    fi
    
    curl_cmd="$curl_cmd http://localhost:8080$endpoint"
    
    local status_code=$(eval "$curl_cmd")
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "  ${GREEN}✅ API ${method} ${endpoint} returned ${status_code}${NC}"
        return 0
    else
        echo -e "  ${RED}❌ API ${method} ${endpoint} returned ${status_code} (expected ${expected_status})${NC}"
        return 1
    fi
}

# Start services if not running
echo -e "\n${YELLOW}Starting services...${NC}"
if ! docker-compose ps | grep -q "Up"; then
    echo "Starting all services..."
    docker-compose up -d
    echo "Waiting for services to be ready..."
    sleep 30
else
    echo "Services are already running"
fi

# Check if all services are running
echo -e "\n${YELLOW}Checking service health...${NC}"

check_service "Frontend" "3000" "/" || exit 1
check_service "Go API" "8080" "/health" || exit 1
check_service "Chain Runner" "8000" "/health" || exit 1

# Test API endpoints
echo -e "\n${YELLOW}Testing API endpoints...${NC}"

run_test "Health Check" "test_api_endpoint '/health'" "success"
run_test "Root Endpoint" "test_api_endpoint '/'" "success"
run_test "Redis Test" "test_api_endpoint '/api/v1/redis/test'" "success"

# Test sheet processing
echo -e "\n${YELLOW}Testing sheet processing...${NC}"

# Create test data
TEST_DATA='{"table":[["","Sales","Revenue"],["Q1","100","10000"],["Q2","150","15000"]]}'
SHEET_ID="test_$(date +%s)"

run_test "Submit Sheet" "test_api_endpoint '/api/v1/sheets/${SHEET_ID}/run' 'POST' '$TEST_DATA' '202'" "success"

# Wait for processing
echo -e "\n${YELLOW}Waiting for processing to complete...${NC}"
sleep 10

# Check results
run_test "Get Sheet Status" "test_api_endpoint '/api/v1/sheets/${SHEET_ID}/status'" "success"

# Test frontend functionality
echo -e "\n${YELLOW}Testing frontend functionality...${NC}"

# Test if frontend loads
run_test "Frontend Loads" "curl -s -f http://localhost:3000/ | grep -q 'SmartSpreadsheet'" "success"

# Test if API proxy works
run_test "API Proxy" "curl -s -f http://localhost:3000/api/v1/redis/test" "success"

# Test with different data formats
echo -e "\n${YELLOW}Testing different data formats...${NC}"

# Test with tab-separated data
TAB_DATA='{"table":[["","Sales","Revenue"],["Q1","100","10000"],["Q2","150","15000"]]}'
TAB_SHEET_ID="test_tab_$(date +%s)"

run_test "Tab-Separated Data" "test_api_endpoint '/api/v1/sheets/${TAB_SHEET_ID}/run' 'POST' '$TAB_DATA' '202'" "success"

# Test with larger dataset
LARGE_DATA='{"table":[["","Sales","Revenue","Profit"],["Q1","100","10000","2000"],["Q2","150","15000","3000"],["Q3","200","20000","4000"],["Q4","250","25000","5000"]]}'
LARGE_SHEET_ID="test_large_$(date +%s)"

run_test "Large Dataset" "test_api_endpoint '/api/v1/sheets/${LARGE_SHEET_ID}/run' 'POST' '$LARGE_DATA' '202'" "success"

# Wait for processing
sleep 15

# Check large dataset results
run_test "Large Dataset Results" "test_api_endpoint '/api/v1/sheets/${LARGE_SHEET_ID}/status'" "success"

# Test error handling
echo -e "\n${YELLOW}Testing error handling...${NC}"

# Test invalid sheet ID
run_test "Invalid Sheet ID" "test_api_endpoint '/api/v1/sheets/invalid/status' 'GET' '' '404'" "success"

# Test invalid JSON
run_test "Invalid JSON" "test_api_endpoint '/api/v1/sheets/test_invalid/run' 'POST' 'invalid json' '400'" "success"

# Test empty data
run_test "Empty Data" "test_api_endpoint '/api/v1/sheets/test_empty/run' 'POST' '{\"table\":[]}' '400'" "success"

# Performance test
echo -e "\n${YELLOW}Testing performance...${NC}"

# Test concurrent requests
echo "Testing concurrent requests..."
for i in {1..5}; do
    CONCURRENT_DATA="{\"table\":[[\"\",\"Test${i}\"],[\"Row1\",\"Value${i}\"]]}"
    CONCURRENT_SHEET_ID="concurrent_${i}_$(date +%s)"
    
    run_test "Concurrent Request $i" "test_api_endpoint '/api/v1/sheets/${CONCURRENT_SHEET_ID}/run' 'POST' '$CONCURRENT_DATA' '202'" "success" &
done

wait

# Summary
echo -e "\n${YELLOW}Test Summary${NC}"
echo "============"
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed! Frontend is working correctly.${NC}"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed. Please check the output above.${NC}"
    exit 1
fi 