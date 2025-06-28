// Main Application Logic
class SmartSpreadsheetApp {
    constructor() {
        this.api = new SmartSpreadsheetAPI();
        this.currentSheetId = null;
        this.pollingInterval = null;
        this.state = {
            isProcessing: false,
            jobCount: 0,
            completedJobs: 0,
            results: {}
        };
        
        this.initializeApp();
    }

    async initializeApp() {
        try {
            // Check backend health
            await this.checkBackendHealth();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Load saved data from localStorage
            this.loadSavedData();
            
            // Update status
            this.updateStatus('Ready');
            
        } catch (error) {
            this.showToast('Backend services not available. Please ensure all services are running.', 'error');
            console.error('Initialization failed:', error);
        }
    }

    async checkBackendHealth() {
        try {
            const [goHealth, chainHealth] = await Promise.all([
                this.api.checkHealth(),
                this.api.checkChainRunnerHealth()
            ]);
            
            console.log('Backend health:', { go: goHealth, chain: chainHealth });
            return true;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    setupEventListeners() {
        // Input controls
        document.getElementById('sampleDataBtn').addEventListener('click', () => this.loadSampleData());
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearData());
        document.getElementById('uploadFileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Submit button
        document.getElementById('submitBtn').addEventListener('click', () => this.submitData());
        
        // Results controls
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshResults());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportResults());
        
        // Input change handler
        document.getElementById('dataInput').addEventListener('input', (e) => this.handleInputChange(e));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    handleInputChange(event) {
        const data = event.target.value;
        this.updateDataPreview(data);
        this.saveDataToStorage(data);
    }

    updateDataPreview(data) {
        const previewTable = document.getElementById('previewTable');
        
        if (!data.trim()) {
            previewTable.innerHTML = '<p class="no-data">No data entered yet. Paste CSV data above to see preview.</p>';
            return;
        }

        try {
            const tableData = this.parseCSV(data);
            const html = this.generatePreviewHTML(tableData);
            previewTable.innerHTML = html;
        } catch (error) {
            previewTable.innerHTML = `<p class="no-data" style="color: #f56565;">Error parsing data: ${error.message}</p>`;
        }
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        return lines.map(line => line.split(',').map(cell => cell.trim()));
    }

    generatePreviewHTML(tableData) {
        if (!tableData.length) return '<p class="no-data">No data to preview.</p>';

        let html = '<table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">';
        
        tableData.forEach((row, rowIndex) => {
            html += '<tr>';
            row.forEach((cell, colIndex) => {
                const isHeader = rowIndex === 0;
                const isLabel = colIndex === 0;
                const style = `
                    border: 1px solid #e2e8f0; 
                    padding: 8px; 
                    text-align: left;
                    background: ${isHeader ? '#f7fafc' : isLabel ? '#edf2f7' : 'white'};
                    font-weight: ${isHeader ? '600' : 'normal'};
                `;
                html += `<td style="${style}">${cell || ''}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</table>';
        return html;
    }

    loadSampleData() {
        const sampleData = `,Sales,Revenue,Profit
Q1,100,10000,2000
Q2,150,15000,3000
Q3,200,20000,4000
Q4,250,25000,5000`;
        
        document.getElementById('dataInput').value = sampleData;
        this.updateDataPreview(sampleData);
        this.saveDataToStorage(sampleData);
        this.showToast('Sample data loaded!', 'success');
    }

    clearData() {
        document.getElementById('dataInput').value = '';
        this.updateDataPreview('');
        this.saveDataToStorage('');
        this.showToast('Data cleared!', 'success');
    }

    async submitData() {
        const dataInput = document.getElementById('dataInput');
        const data = dataInput.value.trim();
        
        if (!data) {
            this.showToast('Please enter some data first!', 'warning');
            return;
        }

        try {
            // Parse and validate data
            const tableData = this.parseCSV(data);
            if (tableData.length < 2) {
                this.showToast('Please enter at least 2 rows of data (header + data)', 'warning');
                return;
            }

            // Generate sheet ID and submit
            this.currentSheetId = this.api.generateSheetId();
            this.updateStatus('Submitting...');
            
            const response = await this.api.submitSheet(this.currentSheetId, tableData);
            
            this.state.jobCount = response.jobCount;
            this.state.completedJobs = 0;
            this.state.results = {};
            
            this.updateStatus('Processing...');
            this.showSubmitSection(true);
            this.showResultsSection(true);
            
            this.showToast(`Processing started! ${response.jobCount} jobs created.`, 'success');
            
            // Start polling for results
            this.startPolling();
            
        } catch (error) {
            this.showToast(`Submission failed: ${error.message}`, 'error');
            this.updateStatus('Error');
            console.error('Submit error:', error);
        }
    }

    showSubmitSection(show) {
        const jobInfo = document.getElementById('jobInfo');
        const submitBtn = document.getElementById('submitBtn');
        
        if (show) {
            jobInfo.style.display = 'flex';
            submitBtn.disabled = true;
            document.getElementById('jobCount').textContent = this.state.jobCount;
            this.updateProgress();
        } else {
            jobInfo.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    showResultsSection(show) {
        const resultsSection = document.getElementById('resultsSection');
        resultsSection.style.display = show ? 'block' : 'none';
    }

    startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        
        this.pollingInterval = setInterval(async () => {
            await this.pollResults();
        }, 2000); // Poll every 2 seconds
    }

    async pollResults() {
        if (!this.currentSheetId) return;
        
        try {
            const response = await this.api.getSheetStatus(this.currentSheetId);
            this.updateResults(response.results);
            
            // Check if all jobs are complete
            const completedCount = Object.keys(response.results).length;
            if (completedCount >= this.state.jobCount) {
                this.stopPolling();
                this.updateStatus('Complete');
                this.showToast('All jobs completed!', 'success');
            }
            
        } catch (error) {
            console.error('Polling error:', error);
            // Don't show error toast for every polling failure
        }
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.showSubmitSection(false);
    }

    updateResults(results) {
        this.state.results = results;
        this.state.completedJobs = Object.keys(results).length;
        
        this.updateProgress();
        this.renderResults();
    }

    updateProgress() {
        const progress = this.state.jobCount > 0 ? 
            Math.round((this.state.completedJobs / this.state.jobCount) * 100) : 0;
        document.getElementById('jobProgress').textContent = `${progress}%`;
    }

    renderResults() {
        const resultsTable = document.getElementById('resultsTable');
        
        if (Object.keys(this.state.results).length === 0) {
            resultsTable.innerHTML = '<p class="no-results">Processing... Results will appear here.</p>';
            return;
        }

        let html = '<div style="display: grid; gap: 15px;">';
        
        Object.entries(this.state.results).forEach(([cellKey, resultData]) => {
            try {
                const result = typeof resultData === 'string' ? JSON.parse(resultData) : resultData;
                const [row, col] = cellKey.split(':');
                
                html += `
                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <h4 style="margin: 0; color: #2d3748;">Cell ${row}:${col}</h4>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <button onclick="app.copyToClipboard('${result.result.replace(/'/g, "\\'")}')" 
                                        style="background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; font-size: 0.8rem; cursor: pointer;">
                                    📋 Copy
                                </button>
                                <span style="font-size: 0.8rem; color: #718096;">${new Date(result.timestamp * 1000).toLocaleTimeString()}</span>
                            </div>
                        </div>
                        <div style="background: #f7fafc; padding: 10px; border-radius: 6px; font-size: 0.9rem; line-height: 1.5;">
                            ${result.result}
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error('Error parsing result:', error);
            }
        });
        
        html += '</div>';
        resultsTable.innerHTML = html;
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('Copied to clipboard!', 'success');
        });
    }

    async refreshResults() {
        if (!this.currentSheetId) {
            this.showToast('No active sheet to refresh', 'warning');
            return;
        }
        
        try {
            const response = await this.api.getSheetStatus(this.currentSheetId);
            this.updateResults(response.results);
            this.showToast('Results refreshed!', 'success');
        } catch (error) {
            this.showToast(`Refresh failed: ${error.message}`, 'error');
        }
    }

    exportResults() {
        if (Object.keys(this.state.results).length === 0) {
            this.showToast('No results to export', 'warning');
            return;
        }
        
        const dataStr = JSON.stringify(this.state.results, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `smartspreadsheet_results_${Date.now()}.json`;
        link.click();
        
        this.showToast('Results exported!', 'success');
    }

    updateStatus(status) {
        const statusText = document.querySelector('.status-text');
        const statusDot = document.querySelector('.status-dot');
        
        statusText.textContent = status;
        
        // Update status dot color
        statusDot.style.background = 
            status === 'Ready' ? '#48bb78' :
            status === 'Processing...' ? '#ed8936' :
            status === 'Complete' ? '#48bb78' :
            status === 'Error' ? '#f56565' : '#a0aec0';
    }

    showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }

    handleKeyboardShortcuts(event) {
        // Ctrl+Enter to submit
        if (event.ctrlKey && event.key === 'Enter') {
            event.preventDefault();
            this.submitData();
        }
        
        // Escape to clear
        if (event.key === 'Escape') {
            this.clearData();
        }
    }

    saveDataToStorage(data) {
        try {
            localStorage.setItem('smartspreadsheet_data', data);
        } catch (error) {
            console.error('Failed to save data to localStorage:', error);
        }
    }

    loadSavedData() {
        try {
            const savedData = localStorage.getItem('smartspreadsheet_data');
            if (savedData) {
                document.getElementById('dataInput').value = savedData;
                this.updateDataPreview(savedData);
            }
        } catch (error) {
            console.error('Failed to load data from localStorage:', error);
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            document.getElementById('dataInput').value = content;
            this.updateDataPreview(content);
            this.saveDataToStorage(content);
            this.showToast(`File "${file.name}" loaded successfully!`, 'success');
        };
        reader.readAsText(file);
        
        // Reset file input
        event.target.value = '';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SmartSpreadsheetApp();
}); 