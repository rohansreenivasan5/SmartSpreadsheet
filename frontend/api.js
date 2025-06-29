// API Client for SmartSpreadsheet Backend
class SmartSpreadsheetAPI {
    constructor() {
        this.baseURL = 'http://localhost:8080';
        this.chainRunnerURL = 'http://localhost:8000';
    }

    // Health check for Go API
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseURL}/health`);
            return await response.json();
        } catch (error) {
            throw new Error(`Health check failed: ${error.message}`);
        }
    }

    // Health check for Chain Runner
    async checkChainRunnerHealth() {
        try {
            const response = await fetch(`${this.chainRunnerURL}/health`);
            return await response.json();
        } catch (error) {
            throw new Error(`Chain runner health check failed: ${error.message}`);
        }
    }

    // Submit spreadsheet for processing
    async submitSheet(sheetId, tableData) {
        try {
            const response = await fetch(`${this.baseURL}/api/v1/sheets/${sheetId}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ table: tableData })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`Failed to submit sheet: ${error.message}`);
        }
    }

    // Get processing status and results
    async getSheetStatus(sheetId) {
        try {
            const response = await fetch(`${this.baseURL}/api/v1/sheets/${sheetId}/status`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`Failed to get sheet status: ${error.message}`);
        }
    }

    // Submit autofill request
    async submitAutofill(rows, cols) {
        try {
            const response = await fetch(`${this.baseURL}/api/v1/autofill`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rows, cols })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`Failed to submit autofill: ${error.message}`);
        }
    }

    // Get autofill status and results
    async getAutofillStatus(autofillId) {
        try {
            const response = await fetch(`${this.baseURL}/api/v1/autofill/${autofillId}/status`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`Failed to get autofill status: ${error.message}`);
        }
    }

    // Test Redis connectivity
    async testRedis() {
        try {
            const response = await fetch(`${this.baseURL}/api/v1/redis/test`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            throw new Error(`Redis test failed: ${error.message}`);
        }
    }

    // Generate a unique sheet ID
    generateSheetId() {
        return `sheet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Export for use in other modules
window.SmartSpreadsheetAPI = SmartSpreadsheetAPI; 