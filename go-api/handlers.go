package main

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Request/Response models
type SheetRunRequest struct {
	Table [][]string `json:"table" binding:"required"`
}

type SheetStatusResponse struct {
	Results map[string]string `json:"results"`
	Error   string            `json:"error,omitempty"`
}

// POST /api/v1/sheets/:sheetId/run
func handleSheetRun(c *gin.Context) {
	sheetID := c.Param("sheetId")
	if sheetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Sheet ID is required",
		})
		return
	}

	var req SheetRunRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body: " + err.Error(),
		})
		return
	}

	// Validate table structure
	if len(req.Table) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Table cannot be empty",
		})
		return
	}

	// Store the full table in Redis
	err := storeSheetData(sheetID, req.Table)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to store sheet data: " + err.Error(),
		})
		return
	}

	// Create jobs for each cell that needs processing
	// Skip first row (headers) and first column (labels)
	// Process cells where row >= 1 and col >= 2
	jobCount := 0
	for row := 1; row < len(req.Table); row++ {
		for col := 2; col < len(req.Table[row]); col++ {
			cellValue := req.Table[row][col]
			err := addJobToStream(sheetID, row, col, cellValue)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "Failed to create job: " + err.Error(),
				})
				return
			}
			jobCount++
		}
	}

	c.JSON(http.StatusAccepted, gin.H{
		"message":  "Sheet processing started",
		"sheetId":  sheetID,
		"jobCount": jobCount,
		"status":   "accepted",
	})
}

// GET /api/v1/sheets/:sheetId/status
func handleSheetStatus(c *gin.Context) {
	sheetID := c.Param("sheetId")
	if sheetID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Sheet ID is required",
		})
		return
	}

	// Get results from Redis
	results, err := getSheetResults(sheetID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to get sheet results: " + err.Error(),
		})
		return
	}

	// If no results yet, return empty map
	if results == nil {
		results = make(map[string]string)
	}

	c.JSON(http.StatusOK, SheetStatusResponse{
		Results: results,
	})
}

// Helper function to validate table dimensions
func validateTable(table [][]string) error {
	if len(table) == 0 {
		return fmt.Errorf("table cannot be empty")
	}

	// Check if all rows have the same number of columns
	expectedCols := len(table[0])
	for i, row := range table {
		if len(row) != expectedCols {
			return fmt.Errorf("row %d has %d columns, expected %d", i, len(row), expectedCols)
		}
	}

	return nil
}
