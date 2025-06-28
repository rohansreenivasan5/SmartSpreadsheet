package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var redisClient *redis.Client

// Initialize Redis connection
func initRedis() error {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	redisClient = redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		return fmt.Errorf("failed to connect to Redis: %v", err)
	}

	log.Printf("Successfully connected to Redis at %s", redisAddr)
	return nil
}

// Store sheet data in Redis with TTL
func storeSheetData(sheetID string, table [][]string) error {
	ctx := context.Background()

	// Convert table to JSON
	data, err := json.Marshal(table)
	if err != nil {
		return fmt.Errorf("failed to marshal table data: %v", err)
	}

	// Store with 24 hour TTL
	key := fmt.Sprintf("sheet:%s:data", sheetID)
	err = redisClient.Set(ctx, key, data, 24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to store sheet data: %v", err)
	}

	log.Printf("Stored sheet data for sheet ID: %s", sheetID)
	return nil
}

// Add job to Redis stream
func addJobToStream(sheetID string, row, col int, cellValue string) error {
	ctx := context.Background()

	streamKey := "sheet-jobs-stream"
	jobData := map[string]interface{}{
		"sheetId":   sheetID,
		"row":       row,
		"col":       col,
		"cellValue": cellValue,
	}

	// Add job to stream
	_, err := redisClient.XAdd(ctx, &redis.XAddArgs{
		Stream: streamKey,
		Values: jobData,
	}).Result()

	if err != nil {
		return fmt.Errorf("failed to add job to stream: %v", err)
	}

	log.Printf("Added job to stream: sheetId=%s, row=%d, col=%d, cellValue=%s", sheetID, row, col, cellValue)
	return nil
}

// Get sheet results from Redis hash
func getSheetResults(sheetID string) (map[string]string, error) {
	ctx := context.Background()

	key := fmt.Sprintf("sheet:%s:results", sheetID)
	results, err := redisClient.HGetAll(ctx, key).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get sheet results: %v", err)
	}

	return results, nil
}

// Store result in Redis hash
func storeResult(sheetID, cellKey, result string) error {
	ctx := context.Background()

	key := fmt.Sprintf("sheet:%s:results", sheetID)
	err := redisClient.HSet(ctx, key, cellKey, result).Err()
	if err != nil {
		return fmt.Errorf("failed to store result: %v", err)
	}

	log.Printf("Stored result for sheet %s, cell %s", sheetID, cellKey)
	return nil
}

// Test Redis connectivity
func testRedisConnection() error {
	ctx := context.Background()

	// Test basic operations
	testKey := "test:connection"
	testValue := "test_value"

	// Set value
	err := redisClient.Set(ctx, testKey, testValue, time.Minute).Err()
	if err != nil {
		return fmt.Errorf("failed to set test value: %v", err)
	}

	// Get value
	val, err := redisClient.Get(ctx, testKey).Result()
	if err != nil {
		return fmt.Errorf("failed to get test value: %v", err)
	}

	if val != testValue {
		return fmt.Errorf("test value mismatch: expected %s, got %s", testValue, val)
	}

	// Test stream operations
	streamKey := "test:stream"
	_, err = redisClient.XAdd(ctx, &redis.XAddArgs{
		Stream: streamKey,
		Values: map[string]interface{}{"test": "data"},
	}).Result()
	if err != nil {
		return fmt.Errorf("failed to add to test stream: %v", err)
	}

	// Test hash operations
	hashKey := "test:hash"
	err = redisClient.HSet(ctx, hashKey, "field1", "value1").Err()
	if err != nil {
		return fmt.Errorf("failed to set hash field: %v", err)
	}

	hashVal, err := redisClient.HGet(ctx, hashKey, "field1").Result()
	if err != nil {
		return fmt.Errorf("failed to get hash field: %v", err)
	}

	if hashVal != "value1" {
		return fmt.Errorf("hash value mismatch: expected value1, got %s", hashVal)
	}

	// Clean up test data
	redisClient.Del(ctx, testKey, streamKey, hashKey)

	log.Println("Redis connection test passed")
	return nil
}
