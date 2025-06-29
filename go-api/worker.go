package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	streamKey         = "sheet-jobs-stream"
	autofillStreamKey = "autofill-jobs-stream"
	consumerGroup     = "cell-workers"
	consumerName      = "worker-A"
)

// ChainRunnerRequest represents the request to the chain-runner service
type ChainRunnerRequest struct {
	PromptTemplate string            `json:"prompt_template"`
	Inputs         map[string]string `json:"inputs"`
}

// ChainRunnerResponse represents the response from the chain-runner service
type ChainRunnerResponse struct {
	Result  string `json:"result"`
	TraceID string `json:"trace_id"`
	Error   string `json:"error,omitempty"`
}

// Create consumer group if it doesn't exist
func setupConsumerGroup() error {
	ctx := context.Background()
	// Try to create the group for sheet-jobs-stream; ignore BUSYGROUP error
	cmd := redisClient.XGroupCreateMkStream(ctx, streamKey, consumerGroup, "$")
	err := cmd.Err()
	if err != nil && !isBusyGroupError(err) {
		return fmt.Errorf("failed to create consumer group: %v", err)
	}
	if err == nil {
		log.Printf("Created consumer group %s on stream %s", consumerGroup, streamKey)
	} else {
		log.Printf("Consumer group %s already exists on stream %s", consumerGroup, streamKey)
	}
	// Try to create the group for autofill-jobs-stream; ignore BUSYGROUP error
	autoCmd := redisClient.XGroupCreateMkStream(ctx, autofillStreamKey, consumerGroup, "$")
	autoErr := autoCmd.Err()
	if autoErr != nil && !isBusyGroupError(autoErr) {
		return fmt.Errorf("failed to create consumer group for autofill: %v", autoErr)
	}
	if autoErr == nil {
		log.Printf("Created consumer group %s on stream %s", consumerGroup, autofillStreamKey)
	} else {
		log.Printf("Consumer group %s already exists on stream %s", consumerGroup, autofillStreamKey)
	}
	return nil
}

func isBusyGroupError(err error) bool {
	return err != nil && (err.Error() == "BUSYGROUP Consumer Group name already exists" ||
		(err.Error() != "" && (len(err.Error()) > 8 && err.Error()[:8] == "BUSYGROUP")))
}

// Call chain-runner service
func callChainRunner(sheetId string, row, col int, cellValue string) (*ChainRunnerResponse, error) {
	// Create a simple template that uses the cell value
	promptTemplate := "Analyze this spreadsheet cell value and provide insights: {cell_value}"
	inputs := map[string]string{
		"cell_value": cellValue,
	}

	request := ChainRunnerRequest{
		PromptTemplate: promptTemplate,
		Inputs:         inputs,
	}

	jsonData, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	// Make HTTP request to chain-runner
	chainRunnerURL := os.Getenv("CHAIN_RUNNER_URL")
	if chainRunnerURL == "" {
		chainRunnerURL = "http://localhost:8000"
	}
	chainRunnerURL = fmt.Sprintf("%s/chain/run", chainRunnerURL)
	resp, err := http.Post(chainRunnerURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to call chain-runner: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("chain-runner returned status %d: %s", resp.StatusCode, string(body))
	}

	var response ChainRunnerResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %v", err)
	}

	return &response, nil
}

// Worker loop: read jobs from both streams, process them, and store results
func startWorkerLoop() {
	ctx := context.Background()
	log.Println("[WORKER] startWorkerLoop running...")
	for {
		// Read up to 10 jobs from both streams, block for 2 seconds if none
		streams, err := redisClient.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    consumerGroup,
			Consumer: consumerName,
			Streams:  []string{streamKey, autofillStreamKey, ">", ">"},
			Count:    10,
			Block:    2 * time.Second,
		}).Result()
		if err != nil && err != redis.Nil {
			log.Printf("XReadGroup error: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}
		if len(streams) == 0 {
			continue // No jobs
		}
		for _, stream := range streams {
			for _, msg := range stream.Messages {
				if stream.Stream == autofillStreamKey {
					processAutofillJob(ctx, msg)
				} else {
					processLegacyJob(ctx, msg)
				}
			}
		}
	}
}

func processAutofillJob(ctx context.Context, msg redis.XMessage) {
	autofillId, _ := msg.Values["autofillId"].(string)
	rowIndex, _ := parseInt(msg.Values["rowIndex"].(string))
	colIndex, _ := parseInt(msg.Values["colIndex"].(string))
	rowLabel, _ := msg.Values["rowLabel"].(string)
	colLabel, _ := msg.Values["colLabel"].(string)

	log.Printf("[WORKER] Processing autofill job: autofillId=%s, row=%d, col=%d, rowLabel=%s, colLabel=%s, msgID=%s",
		autofillId, rowIndex, colIndex, rowLabel, colLabel, msg.ID)

	promptTemplate := "What is the {attribute} of {item}?"
	inputs := map[string]string{
		"attribute": colLabel,
		"item":      rowLabel,
	}
	request := ChainRunnerRequest{
		PromptTemplate: promptTemplate,
		Inputs:         inputs,
	}
	jsonData, _ := json.Marshal(request)
	chainRunnerURL := os.Getenv("CHAIN_RUNNER_URL")
	if chainRunnerURL == "" {
		chainRunnerURL = "http://localhost:8000"
	}
	chainRunnerURL = fmt.Sprintf("%s/chain/run", chainRunnerURL)
	resp, err := http.Post(chainRunnerURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		log.Printf("[WORKER] Error calling chain-runner: %v", err)
		redisClient.XAck(ctx, autofillStreamKey, consumerGroup, msg.ID)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		log.Printf("[WORKER] chain-runner returned status %d: %s", resp.StatusCode, string(body))
		redisClient.XAck(ctx, autofillStreamKey, consumerGroup, msg.ID)
		return
	}
	var response ChainRunnerResponse
	if err := json.Unmarshal(body, &response); err != nil {
		log.Printf("[WORKER] Failed to unmarshal response: %v", err)
		redisClient.XAck(ctx, autofillStreamKey, consumerGroup, msg.ID)
		return
	}
	// Store result in autofill results hash
	resultKey := fmt.Sprintf("autofill:%s:results", autofillId)
	fieldKey := fmt.Sprintf("%d:%d", rowIndex, colIndex)
	resultData := map[string]interface{}{
		"result":    response.Result,
		"trace_id":  response.TraceID,
		"status":    "completed",
		"timestamp": time.Now().Unix(),
	}
	resultJSON, _ := json.Marshal(resultData)
	if err := redisClient.HSet(ctx, resultKey, fieldKey, string(resultJSON)).Err(); err != nil {
		log.Printf("[WORKER] Failed to store autofill result: %v", err)
	}
	redisClient.XAck(ctx, autofillStreamKey, consumerGroup, msg.ID)
}

func processLegacyJob(ctx context.Context, msg redis.XMessage) {
	sheetId, _ := msg.Values["sheetId"].(string)
	rowStr, _ := msg.Values["row"].(string)
	colStr, _ := msg.Values["col"].(string)
	cellValue, _ := msg.Values["cellValue"].(string)
	row, _ := parseInt(rowStr)
	col, _ := parseInt(colStr)
	log.Printf("[WORKER] Processing legacy job: sheetId=%s, row=%d, col=%d, cellValue=%s, msgID=%s",
		sheetId, row, col, cellValue, msg.ID)
	response, err := callChainRunner(sheetId, row, col, cellValue)
	if err != nil {
		log.Printf("[WORKER] Error processing job %s: %v", msg.ID, err)
		redisClient.XAck(ctx, streamKey, consumerGroup, msg.ID)
		return
	}
	resultKey := fmt.Sprintf("sheet:%s:results", sheetId)
	fieldKey := fmt.Sprintf("%d:%d", row, col)
	resultData := map[string]interface{}{
		"result":    response.Result,
		"trace_id":  response.TraceID,
		"status":    "completed",
		"timestamp": time.Now().Unix(),
	}
	resultJSON, _ := json.Marshal(resultData)
	if err := redisClient.HSet(ctx, resultKey, fieldKey, string(resultJSON)).Err(); err != nil {
		log.Printf("[WORKER] Failed to store result for job %s: %v", msg.ID, err)
	} else {
		log.Printf("[WORKER] Stored result for job %s: %s", msg.ID, response.Result[:50])
	}
	redisClient.XAck(ctx, streamKey, consumerGroup, msg.ID)
}

func parseInt(s string) (int, error) {
	return strconv.Atoi(s)
}

// Entrypoint for worker
func RunWorker() {
	log.Println("[WORKER] RunWorker started")
	if err := setupConsumerGroup(); err != nil {
		log.Fatal("Failed to set up consumer group:", err)
	}
	startWorkerLoop()
}
