package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"crypto/rand"
	"encoding/hex"

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

// --- Autofill Types & Helpers ---

type AutofillJob struct {
	AutofillID string
	RowIndex   int
	ColIndex   int
	RowLabel   string
	ColLabel   string
}

func generateAutofillID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "autofill_" + hex.EncodeToString(b)
}

func storeAutofillMeta(autofillID string, rows, cols []string) error {
	ctx := context.Background()
	meta := map[string]interface{}{
		"rows": toJSON(rows),
		"cols": toJSON(cols),
	}
	key := "autofill:" + autofillID + ":meta"
	return redisClient.HSet(ctx, key, meta).Err()
}

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func addAutofillJobToStream(job AutofillJob) error {
	ctx := context.Background()
	streamKey := "autofill-jobs-stream"
	jobData := map[string]interface{}{
		"autofillId": job.AutofillID,
		"rowIndex":   job.RowIndex,
		"colIndex":   job.ColIndex,
		"rowLabel":   job.RowLabel,
		"colLabel":   job.ColLabel,
	}
	_, err := redisClient.XAdd(ctx, &redis.XAddArgs{
		Stream: streamKey,
		Values: jobData,
	}).Result()
	return err
}

func getAutofillResults(autofillID string) (map[string]string, error) {
	ctx := context.Background()
	key := "autofill:" + autofillID + ":results"
	return redisClient.HGetAll(ctx, key).Result()
}
