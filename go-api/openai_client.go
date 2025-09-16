package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// Minimal typed client for OpenAI Chat Completions

type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIChatRequest struct {
	Model       string              `json:"model"`
	Messages    []openAIChatMessage `json:"messages"`
	Temperature *float32            `json:"temperature,omitempty"`
}

type openAIChatChoice struct {
	Index   int `json:"index"`
	Message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"message"`
}

type openAIChatResponse struct {
	ID      string             `json:"id"`
	Choices []openAIChatChoice `json:"choices"`
}

func callOpenAIChat(ctx context.Context, prompt string) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY is not set")
	}
	model := os.Getenv("OPENAI_MODEL")
	if model == "" {
		model = "gpt-3.5-turbo"
	}
	var tempPtr *float32
	if t := os.Getenv("OPENAI_TEMPERATURE"); t != "" {
		var tv float32
		_, _ = fmt.Sscan(t, &tv)
		tempPtr = &tv
	}

	reqBody := openAIChatRequest{
		Model:       model,
		Messages:    []openAIChatMessage{{Role: "user", Content: prompt}},
		Temperature: tempPtr,
	}
	b, _ := json.Marshal(reqBody)

	httpClient := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/chat/completions", bytes.NewBuffer(b))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var buf bytes.Buffer
		_, _ = buf.ReadFrom(resp.Body)
		return "", fmt.Errorf("openai status %d: %s", resp.StatusCode, buf.String())
	}

	var out openAIChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("openai response had no choices")
	}
	return out.Choices[0].Message.Content, nil
}
