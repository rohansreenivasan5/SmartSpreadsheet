package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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

	// Build concise prompt and call OpenAI directly
	prompt := fmt.Sprintf("What is the %s of %s? Answer briefly.", colLabel, rowLabel)
	text, err := callOpenAIChat(ctx, prompt)
	if err != nil {
		log.Printf("[WORKER] OpenAI error: %v", err)
		redisClient.XAck(ctx, autofillStreamKey, consumerGroup, msg.ID)
		return
	}
	// Store result in autofill results hash
	resultKey := fmt.Sprintf("autofill:%s:results", autofillId)
	fieldKey := fmt.Sprintf("%d:%d", rowIndex, colIndex)
	resultData := map[string]interface{}{
		"result":    text,
		"trace_id":  "",
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

	prompt := fmt.Sprintf("Analyze this spreadsheet cell value and provide insights: %s. Answer briefly.", cellValue)
	text, err := callOpenAIChat(ctx, prompt)
	if err != nil {
		log.Printf("[WORKER] Error processing job %s: %v", msg.ID, err)
		redisClient.XAck(ctx, streamKey, consumerGroup, msg.ID)
		return
	}
	resultKey := fmt.Sprintf("sheet:%s:results", sheetId)
	fieldKey := fmt.Sprintf("%d:%d", row, col)
	resultData := map[string]interface{}{
		"result":    text,
		"trace_id":  "",
		"status":    "completed",
		"timestamp": time.Now().Unix(),
	}
	resultJSON, _ := json.Marshal(resultData)
	if err := redisClient.HSet(ctx, resultKey, fieldKey, string(resultJSON)).Err(); err != nil {
		log.Printf("[WORKER] Failed to store result for job %s: %v", msg.ID, err)
	} else {
		preview := text
		if len(preview) > 50 {
			preview = preview[:50]
		}
		log.Printf("[WORKER] Stored result for job %s: %s", msg.ID, preview)
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
