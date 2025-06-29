package main

import (
	"log"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	log.Println("[MAIN] main() starting up...")
	// Set Gin mode
	gin.SetMode(gin.ReleaseMode)

	// Initialize Redis connection
	if err := initRedis(); err != nil {
		log.Fatal("Failed to initialize Redis:", err)
	}

	// Test Redis connectivity
	if err := testRedisConnection(); err != nil {
		log.Fatal("Redis connectivity test failed:", err)
	}

	// Start the worker loop as a goroutine
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[WORKER] PANIC: %v", r)
			}
		}()
		log.Println("Starting background worker loop...")
		RunWorker()
	}()

	// Create Gin router
	r := gin.Default()

	// Enable CORS for all origins (for local dev and Docker frontend)
	r.Use(cors.Default())

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "go-api",
		})
	})

	// Root endpoint
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service": "Go API",
			"version": "1.0.0",
			"endpoints": gin.H{
				"health":     "/health",
				"sheets":     "/api/v1/sheets",
				"redis_test": "/api/v1/redis/test",
			},
		})
	})

	// API v1 routes
	v1 := r.Group("/api/v1")
	{
		// Redis test endpoint
		v1.GET("/redis/test", func(c *gin.Context) {
			if err := testRedisConnection(); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "Redis test failed: " + err.Error(),
				})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"status": "Redis connection test passed",
			})
		})

		sheets := v1.Group("/sheets")
		{
			sheets.POST("/:sheetId/run", handleSheetRun)
			sheets.GET("/:sheetId/status", handleSheetStatus)
		}

		// Autofill endpoints
		v1.POST("/autofill", handleAutofill)
		v1.GET("/autofill/:id/status", handleAutofillStatus)
	}

	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Start server
	log.Printf("Starting Go API server on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
