#!/bin/bash

echo "🚀 Starting SmartSpreadsheet MVP End-to-End Test"
echo "================================================"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "❌ jq is required but not installed. Please install jq to run this test."
    echo "   macOS: brew install jq"
    echo "   Ubuntu: sudo apt-get install jq"
    exit 1
fi

# Test 1: Health checks
echo "📋 Testing service health..."
echo "Go API Health:"
curl -s http://localhost:8080/health | jq .
echo "Chain Runner Health:"
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

# Extract job count for better UX
JOB_COUNT=$(echo $RESPONSE | jq -r '.jobCount // 0')
echo "Jobs created: $JOB_COUNT"

# Test 3: Wait for processing
echo ""
echo "⏳ Waiting for AI processing (15 seconds)..."
echo "   Processing $JOB_COUNT cells with AI analysis..."
sleep 15

# Test 4: Get results
echo ""
echo "📈 Retrieving AI-generated results..."
RESULTS=$(curl -s http://localhost:8080/api/v1/sheets/e2e-test/status)
echo $RESULTS | jq .

# Count completed results
COMPLETED_COUNT=$(echo $RESULTS | jq '.results | length')
echo ""
echo "✅ End-to-End Test Complete!"
echo "   Jobs submitted: $JOB_COUNT"
echo "   Results completed: $COMPLETED_COUNT"

if [ "$COMPLETED_COUNT" -gt 0 ]; then
    echo "🎉 Success! AI processing is working correctly."
else
    echo "⚠️  No results found. Check service logs for issues."
    echo "   Run: docker-compose logs go-api"
fi 