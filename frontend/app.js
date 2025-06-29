// --- Spreadsheet Grid State ---
class SpreadsheetGrid {
    constructor(rows = 6, cols = 4) {
        // Initialize with empty first row/col
        this.rows = rows;
        this.cols = cols;
        this.data = Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => (r === 0 && c === 0 ? '' : ''))
        );
    }

    addRow() {
        this.data.push(Array(this.cols).fill(''));
        this.rows++;
    }
    
    addCol() {
        this.data.forEach(row => row.push(''));
        this.cols++;
    }
    
    clear() {
        this.rows = 6;
        this.cols = 4;
        this.data = Array.from({ length: this.rows }, (_, r) =>
            Array.from({ length: this.cols }, (_, c) => (r === 0 && c === 0 ? '' : ''))
        );
    }
    
    setCell(r, c, value) {
        this.data[r][c] = value;
    }
    
    getCell(r, c) {
        return this.data[r][c];
    }
}

// --- Main App Logic ---
class SmartSpreadsheetApp {
    constructor() {
        this.api = new SmartSpreadsheetAPI();
        this.currentAutofillId = null;
        this.pollingInterval = null;
        this.state = {
            isProcessing: false,
            jobCount: 0,
            completedJobs: 0,
            results: {}
        };
        this.grid = new SpreadsheetGrid();
        this.renderGrid();
    }

    async initializeApp() {
        try {
            // Wait a bit for DOM to be fully ready
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Set up event listeners first (DOM is now loaded)
            await this.setupEventListeners();
            
            // Check backend health
            await this.checkBackendHealth();
            
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
            const goHealth = await this.api.checkHealth();
            console.log('Backend health:', { go: goHealth });
            return true;
        } catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }

    async setupEventListeners() {
        // Wait for DOM elements to be available
        const waitForElement = (id, timeout = 5000) => {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkElement = () => {
                    const element = document.getElementById(id);
                    if (element) {
                        resolve(element);
                    } else if (Date.now() - startTime > timeout) {
                        reject(new Error(`Element ${id} not found after ${timeout}ms`));
                    } else {
                        setTimeout(checkElement, 50);
                    }
                };
                checkElement();
            });
        };

        try {
            // Wait for all required elements
            const [addRowBtn, addColBtn, clearGridBtn, submitBtn, refreshBtn, exportBtn] = await Promise.all([
                waitForElement('addRowBtn'),
                waitForElement('addColBtn'),
                waitForElement('clearGridBtn'),
                waitForElement('submitBtn'),
                waitForElement('refreshBtn'),
                waitForElement('exportBtn')
            ]);

            console.log('All DOM elements found successfully');

            // Grid controls
            addRowBtn.addEventListener('click', () => {
                this.grid.addRow();
                this.renderGrid();
            });
            addColBtn.addEventListener('click', () => {
                this.grid.addCol();
                this.renderGrid();
            });
            clearGridBtn.addEventListener('click', () => {
                this.grid.clear();
                this.renderGrid();
            });
            
            // Submit button
            submitBtn.addEventListener('click', () => this.submitAutofill());
            
            // Results controls
            refreshBtn.addEventListener('click', () => this.refreshResults());
            exportBtn.addEventListener('click', () => this.exportResults());
            
            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
            
        } catch (error) {
            console.error('Failed to set up event listeners:', error);
            throw error;
        }
    }

    async submitAutofill() {
        // Extract rows and cols from the grid
        const rows = [];
        const cols = [];
        
        // Get first column (row labels) - skip first cell
        for (let r = 1; r < this.grid.rows; r++) {
            const value = this.grid.getCell(r, 0).trim();
            if (value) {
                rows.push(value);
            }
        }
        
        // Get first row (column labels) - skip first cell
        for (let c = 1; c < this.grid.cols; c++) {
            const value = this.grid.getCell(0, c).trim();
            if (value) {
                cols.push(value);
            }
        }
        
        // Validate input
        if (rows.length === 0) {
            this.showToast('Please enter at least one item in the first column', 'error');
            return;
        }
        
        if (cols.length === 0) {
            this.showToast('Please enter at least one attribute in the first row', 'error');
            return;
        }
        
        try {
            this.setState({ isProcessing: true });
            this.updateStatus('Submitting autofill request...');
            
            // Submit autofill request
            const response = await this.api.submitAutofill(rows, cols);
            
            this.currentAutofillId = response.autofillId;
            this.setState({ 
                jobCount: response.jobCount,
                completedJobs: 0,
                results: {}
            });
            
            this.showToast(`Autofill started! Processing ${response.jobCount} cells...`, 'success');
            this.updateStatus('Processing...');
            
            // Show results section and start polling
            this.showResultsSection(true);
            this.startPolling();
            
        } catch (error) {
            this.showToast(`Failed to start autofill: ${error.message}`, 'error');
            this.setState({ isProcessing: false });
            this.updateStatus('Error');
        }
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.updateUI();
    }

    updateUI() {
        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');
        const jobInfo = document.getElementById('jobInfo');
        const jobCount = document.getElementById('jobCount');
        const jobProgress = document.getElementById('jobProgress');
        
        if (this.state.isProcessing) {
            submitBtn.disabled = true;
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            jobInfo.style.display = 'block';
            jobCount.textContent = this.state.jobCount;
            
            const progress = this.state.jobCount > 0 ? 
                Math.round((this.state.completedJobs / this.state.jobCount) * 100) : 0;
            jobProgress.textContent = `${progress}%`;
        } else {
            submitBtn.disabled = false;
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            jobInfo.style.display = 'none';
        }
    }

    showResultsSection(show) {
        const resultsSection = document.getElementById('resultsSection');
        resultsSection.style.display = show ? 'block' : 'none';
    }

    startPolling() {
        this.pollingInterval = setInterval(() => this.pollResults(), 2000);
    }

    async pollResults() {
        if (!this.currentAutofillId) return;
        
        try {
            const response = await this.api.getAutofillStatus(this.currentAutofillId);
            
            // Parse results and update state
            const results = {};
            let completedJobs = 0;
            
            Object.entries(response.results).forEach(([key, valueStr]) => {
                try {
                    const value = JSON.parse(valueStr);
                    results[key] = value.result;
                    completedJobs++;
                } catch (e) {
                    console.error('Failed to parse result:', valueStr);
                }
            });
            
            this.setState({ 
                results,
                completedJobs
            });
            
            // Update grid with results
            this.updateGridWithResults(results);
            
            // Check if all jobs are complete
            if (completedJobs >= this.state.jobCount) {
                this.stopPolling();
                this.setState({ isProcessing: false });
                this.updateStatus('Complete');
                this.showToast('Autofill completed!', 'success');
            }
            
        } catch (error) {
            console.error('Polling error:', error);
            this.showToast(`Error checking status: ${error.message}`, 'error');
        }
    }

    updateGridWithResults(results) {
        Object.entries(results).forEach(([key, result]) => {
            const [rowIndex, colIndex] = key.split(':').map(Number);
            // Add 1 to skip the header row and column
            const gridRow = rowIndex + 1;
            const gridCol = colIndex + 1;
            
            if (gridRow < this.grid.rows && gridCol < this.grid.cols) {
                this.grid.setCell(gridRow, gridCol, result);
            }
        });
        
        this.renderGrid();
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async refreshResults() {
        if (this.currentAutofillId) {
            await this.pollResults();
        }
    }

    exportResults() {
        // Create CSV from grid data
        let csv = '';
        
        for (let r = 0; r < this.grid.rows; r++) {
            const row = [];
            for (let c = 0; c < this.grid.cols; c++) {
                const cell = this.grid.getCell(r, c) || '';
                row.push(`"${cell.replace(/"/g, '""')}"`);
            }
            csv += row.join(',') + '\n';
        }
        
        // Download CSV file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smartspreadsheet_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        this.showToast('Results exported!', 'success');
    }

    updateStatus(status) {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = statusIndicator.querySelector('.status-text');
        const statusDot = statusIndicator.querySelector('.status-dot');
        
        statusText.textContent = status;
        
        // Update status dot color
        statusDot.className = 'status-dot';
        if (status === 'Ready') {
            statusDot.classList.add('ready');
        } else if (status === 'Processing...') {
            statusDot.classList.add('processing');
        } else if (status === 'Complete') {
            statusDot.classList.add('complete');
        } else if (status === 'Error') {
            statusDot.classList.add('error');
        }
    }

    showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
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
        // Ctrl/Cmd + Enter to submit
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (!this.state.isProcessing) {
                this.submitAutofill();
            }
        }
    }

    loadSavedData() {
        // For now, just initialize with empty grid
        // Could be extended to save/load grid state
    }

    renderGrid() {
        const gridContainer = document.getElementById('spreadsheetGrid');
        let html = '<table class="grid-table">';
        
        for (let r = 0; r < this.grid.rows; r++) {
            html += '<tr>';
            for (let c = 0; c < this.grid.cols; c++) {
                const cellValue = this.grid.getCell(r, c) || '';
                const isHeader = r === 0;
                const isLabel = c === 0;
                const isEditable = isHeader || isLabel;
                const cellClass = isHeader ? 'header-cell' : isLabel ? 'label-cell' : 'data-cell';
                
                html += `<td class="${cellClass}" data-row="${r}" data-col="${c}">`;
                if (isEditable) {
                    html += `<input type="text" value="${cellValue}" placeholder="${isHeader ? 'Attribute...' : 'Item...'}" />`;
                } else {
                    html += `<span class="cell-content">${cellValue}</span>`;
                }
                html += '</td>';
            }
            html += '</tr>';
        }
        
        html += '</table>';
        gridContainer.innerHTML = html;
        
        // Add event listeners for editable cells
        this.setupGridEventListeners();
    }

    setupGridEventListeners() {
        const inputs = document.querySelectorAll('.grid-table input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const row = parseInt(e.target.parentElement.dataset.row);
                const col = parseInt(e.target.parentElement.dataset.col);
                this.grid.setCell(row, col, e.target.value);
            });
        });
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const app = new SmartSpreadsheetApp();
    await app.initializeApp();
}); 