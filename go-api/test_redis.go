package main

import (
	"context"
	"encoding/json"
	"log"
)

func testRedisOperations() {
	log.Println("Testing Redis operations...")

	// Test storing sheet data
	testTable := [][]string{
		{"", "Column 1", "Column 2"},
		{"Row 1", "Data 1", "Data 2"},
		{"Row 2", "Data 3", "Data 4"},
	}

	err := storeSheetData("test123", testTable)
	if err != nil {
		log.Printf("Failed to store sheet data: %v", err)
		return
	}

	// Test adding jobs to stream
	err = addJobToStream("test123", 1, 2, testTable[1][2])
	if err != nil {
		log.Printf("Failed to add job to stream: %v", err)
		return
	}

	err = addJobToStream("test123", 1, 3, testTable[1][1])
	if err != nil {
		log.Printf("Failed to add job to stream: %v", err)
		return
	}

	// Test storing results
	err = storeResult("test123", "1:2", "AI result for cell 1,2")
	if err != nil {
		log.Printf("Failed to store result: %v", err)
		return
	}

	err = storeResult("test123", "1:3", "AI result for cell 1,3")
	if err != nil {
		log.Printf("Failed to store result: %v", err)
		return
	}

	// Test getting results
	results, err := getSheetResults("test123")
	if err != nil {
		log.Printf("Failed to get sheet results: %v", err)
		return
	}

	log.Printf("Retrieved results: %+v", results)

	// Test retrieving the stored table data
	ctx := context.Background()
	key := "sheet:test123:data"
	data, err := redisClient.Get(ctx, key).Result()
	if err != nil {
		log.Printf("Failed to get stored table data: %v", err)
		return
	}

	var retrievedTable [][]string
	err = json.Unmarshal([]byte(data), &retrievedTable)
	if err != nil {
		log.Printf("Failed to unmarshal table data: %v", err)
		return
	}

	log.Printf("Retrieved table data: %+v", retrievedTable)

	log.Println("All Redis operations test passed!")
}
