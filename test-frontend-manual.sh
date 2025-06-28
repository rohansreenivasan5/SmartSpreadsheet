#!/bin/bash

# Manual Frontend Test Script
# Tests the frontend functionality step by step

echo "🧪 Manual Frontend Testing"
echo "=========================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "\n${YELLOW}1. Testing Frontend Accessibility${NC}"
echo "Frontend URL: http://localhost:3000"
echo "Please open this URL in your browser"

echo -e "\n${YELLOW}2. Testing Backend Services${NC}"

# Test Go API
echo -e "\n${BLUE}Testing Go API...${NC}"
if curl -s http://localhost:8080/health | grep -q "healthy"; then
    echo -e "  ${GREEN}✅ Go API is healthy${NC}"
else
    echo -e "  ${RED}❌ Go API is not responding${NC}"
fi

# Test Chain Runner
echo -e "\n${BLUE}Testing Chain Runner...${NC}"
if curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo -e "  ${GREEN}✅ Chain Runner is healthy${NC}"
else
    echo -e "  ${RED}❌ Chain Runner is not responding${NC}"
fi

# Test Redis
echo -e "\n${BLUE}Testing Redis...${NC}"
if curl -s http://localhost:8080/api/v1/redis/test | grep -q "passed"; then
    echo -e "  ${GREEN}✅ Redis connection is working${NC}"
else
    echo -e "  ${RED}❌ Redis connection failed${NC}"
fi

echo -e "\n${YELLOW}3. Testing Sheet Processing${NC}"

# Create a test sheet
SHEET_ID="manual_test_$(date +%s)"
TEST_DATA='{"table":[["","Sales","Revenue"],["Q1","100","10000"],["Q2","150","15000"]]}'

echo -e "\n${BLUE}Submitting test sheet...${NC}"
RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -d "$TEST_DATA" "http://localhost:8080/api/v1/sheets/$SHEET_ID/run")
echo "Response: $RESPONSE"

if echo "$RESPONSE" | grep -q "accepted"; then
    echo -e "  ${GREEN}✅ Sheet submitted successfully${NC}"
else
    echo -e "  ${RED}❌ Sheet submission failed${NC}"
    exit 1
fi

# Wait for processing
echo -e "\n${BLUE}Waiting for processing (15 seconds)...${NC}"
sleep 15

# Check results
echo -e "\n${BLUE}Checking results...${NC}"
RESULTS=$(curl -s "http://localhost:8080/api/v1/sheets/$SHEET_ID/status")
echo "Results: $RESULTS"

if echo "$RESULTS" | grep -q "results"; then
    echo -e "  ${GREEN}✅ Results received successfully${NC}"
else
    echo -e "  ${RED}❌ No results received${NC}"
fi

echo -e "\n${YELLOW}4. Frontend Features to Test Manually${NC}"
echo "Please test the following features in your browser:"
echo -e "  ${BLUE}• Load sample data button${NC}"
echo -e "  ${BLUE}• File upload functionality (use test-data.csv)${NC}"
echo -e "  ${BLUE}• Data preview table${NC}"
echo -e "  ${BLUE}• Submit data for processing${NC}"
echo -e "  ${BLUE}• Real-time progress updates${NC}"
echo -e "  ${BLUE}• Results display with copy functionality${NC}"
echo -e "  ${BLUE}• Export results${NC}"
echo -e "  ${BLUE}• Keyboard shortcuts (Ctrl+Enter, Escape)${NC}"
echo -e "  ${BLUE}• Responsive design (resize browser window)${NC}"

echo -e "\n${YELLOW}5. Test Data Available${NC}"
echo "Test CSV file: test-data.csv"
echo "You can upload this file to test the file upload feature."

echo -e "\n${GREEN}🎉 Manual testing setup complete!${NC}"
echo "Open http://localhost:3000 in your browser to test the frontend." 