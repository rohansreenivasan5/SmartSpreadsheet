package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Autofill request/response models

type AutofillRequest struct {
	Rows []string `json:"rows" binding:"required"`
	Cols []string `json:"cols" binding:"required"`
}

type AutofillStatusResponse struct {
	Results map[string]string `json:"results"`
	Error   string            `json:"error,omitempty"`
}

// POST /api/v1/autofill
func handleAutofill(c *gin.Context) {
	var req AutofillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request body: " + err.Error(),
		})
		return
	}
	if len(req.Rows) == 0 || len(req.Cols) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Rows and columns cannot be empty",
		})
		return
	}
	// Generate unique autofill ID
	autofillID := generateAutofillID()
	// Store the rows and cols in Redis for reference
	if err := storeAutofillMeta(autofillID, req.Rows, req.Cols); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store autofill meta: " + err.Error()})
		return
	}
	// Fan out jobs for each (row, col) pair
	jobCount := 0
	for r, rowLabel := range req.Rows {
		for colIdx, colLabel := range req.Cols {
			job := AutofillJob{
				AutofillID: autofillID,
				RowIndex:   r,
				ColIndex:   colIdx,
				RowLabel:   rowLabel,
				ColLabel:   colLabel,
			}
			if err := addAutofillJobToStream(job); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create job: " + err.Error()})
				return
			}
			jobCount++
		}
	}
	c.JSON(http.StatusAccepted, gin.H{
		"message":    "Autofill processing started",
		"autofillId": autofillID,
		"jobCount":   jobCount,
		"status":     "accepted",
	})
}

// GET /api/v1/autofill/:id/status
func handleAutofillStatus(c *gin.Context) {
	autofillID := c.Param("id")
	if autofillID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Autofill ID is required"})
		return
	}
	results, err := getAutofillResults(autofillID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get autofill results: " + err.Error()})
		return
	}
	if results == nil {
		results = make(map[string]string)
	}
	c.JSON(http.StatusOK, AutofillStatusResponse{Results: results})
}
