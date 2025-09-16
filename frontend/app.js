// --- Spreadsheet Grid State ---
class SpreadsheetGrid {
    constructor(rows = 101, cols = 11) {
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
        this.rows = 101;
        this.cols = 11;
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
        this.selected = { row: null, col: null };
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

            // Arrow key navigation and delete
            document.addEventListener('keydown', (e) => {
                if (this.selected.row == null || this.selected.col == null) return;
                const { key } = e;
                let { row, col } = this.selected;
                if (key === 'ArrowUp') { e.preventDefault(); row = Math.max(1, row - 1); }
                if (key === 'ArrowDown') { e.preventDefault(); row = Math.min(this.grid.rows - 1, row + 1); }
                if (key === 'ArrowLeft') { e.preventDefault(); col = Math.max(1, col - 1); }
                if (key === 'ArrowRight') { e.preventDefault(); col = Math.min(this.grid.cols - 1, col + 1); }
                if (row !== this.selected.row || col !== this.selected.col) {
                    this.setSelectedCell(row, col);
                }
                if (key === 'Delete' || key === 'Backspace') {
                    e.preventDefault();
                    this.grid.setCell(this.selected.row, this.selected.col, '');
                    this.renderGrid();
                }
                if (key === 'Enter') {
                    // future: edit mode
                }
            });

            // Cell selection
            const gridEl = document.getElementById('spreadsheetGrid');
            gridEl.addEventListener('click', (e) => {
                const cell = e.target.closest('.cell');
                if (!cell) return;
                const r = parseInt(cell.getAttribute('data-row'));
                const c = parseInt(cell.getAttribute('data-col'));
                this.setSelectedCell(r, c);
            });

            // Paste handling
            document.addEventListener('paste', async (e) => {
                if (this.selected.row == null || this.selected.col == null) return;
                const text = (e.clipboardData || window.clipboardData).getData('text');
                if (!text) return;
                e.preventDefault();
                await this.handlePaste(text);
            });
            
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
        if (resultsSection) {
            resultsSection.style.display = show ? 'block' : 'none';
        }
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
        if (type !== 'error') return;
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
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
        const body = document.getElementById('spreadsheetGrid');
        const header = document.getElementById('sheetHeader');
        // header render
        let h = '<div class="header-index-spacer"></div>';
        // editable header title for the first (label) column
        const firstColTitle = this.grid.getCell(0, 0) || '';
        h += `<div class="header-cell header-label" data-row="0" data-col="0"><input type="text" value="${firstColTitle}" placeholder="Title..." /></div>`;
        for (let c = 1; c < this.grid.cols; c++) {
            const val = this.grid.getCell(0, c) || '';
            h += `<div class="header-cell" data-row="0" data-col="${c}"><input type="text" value="${val}" placeholder="Attribute..." /></div>`;
        }
        header.innerHTML = h;
        // set explicit template columns inline to avoid any CSS var issues
        const dataCols = Math.max(1, this.grid.cols - 1);
        header.style.display = 'grid';
        header.style.gridTemplateColumns = `40px 160px ${Array(dataCols).fill('160px').join(' ')}`;

        // body render
        let b = '';
        for (let r = 1; r < this.grid.rows; r++) {
            const rowTemplate = `40px 160px ${Array(dataCols).fill('160px').join(' ')}`;
            b += `<div class="row" style="display:grid;grid-template-columns:${rowTemplate}">`;
            b += `<div class="row-index-cell">${r}</div>`;
            const labelVal = this.grid.getCell(r, 0) || '';
            b += `<div class="cell" data-row="${r}" data-col="0"><input class="label-input" type="text" value="${labelVal}" /></div>`;
            for (let c = 1; c < this.grid.cols; c++) {
                const val = this.grid.getCell(r, c) || '';
                const isSelected = this.selected.row === r && this.selected.col === c;
                b += `<div class="cell${isSelected ? ' selected' : ''}" data-row="${r}" data-col="${c}"><span class="cell-content">${val}</span></div>`;
            }
            b += '</div>';
        }
        body.innerHTML = b;

        this.setupGridEventListeners();
    }

    setupGridEventListeners() {
        const inputs = document.querySelectorAll('.sheet .header-cell input, .sheet .cell[data-col="0"] input');
        inputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const parent = e.target.closest('.header-cell, .cell');
                const row = parseInt(parent.getAttribute('data-row'));
                const col = parseInt(parent.getAttribute('data-col'));
                this.grid.setCell(row, col, e.target.value);
            });
        });

        // Minimal context menu for data cells
        const grid = document.getElementById('spreadsheetGrid');
        grid.addEventListener('contextmenu', (e) => {
            const cell = e.target.closest('.cell');
            if (!cell || cell.getAttribute('data-col') === '0') return;
            e.preventDefault();
            this.setSelectedCell(parseInt(cell.getAttribute('data-row')), parseInt(cell.getAttribute('data-col')));
            const menu = this.buildContextMenu(e.pageX, e.pageY);
            document.body.appendChild(menu);
            const remove = () => menu.remove();
            setTimeout(() => document.addEventListener('click', remove, { once: true }), 0);
        });
    }

    buildContextMenu(x, y) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.top = `${y}px`;
        el.style.left = `${x}px`;
        el.style.background = '#fff';
        el.style.border = '1px solid #e6e8ee';
        el.style.borderRadius = '8px';
        el.style.boxShadow = '0 8px 16px rgba(16,24,40,0.08)';
        el.style.padding = '6px';
        el.style.zIndex = '1000';
        const mk = (label, onClick) => {
            const item = document.createElement('div');
            item.textContent = label;
            item.style.padding = '6px 10px';
            item.style.fontSize = '12px';
            item.style.cursor = 'pointer';
            item.addEventListener('click', (e) => { e.stopPropagation(); onClick(); el.remove(); });
            item.addEventListener('mouseenter', () => { item.style.background = '#f9fafb'; });
            item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
            return item;
        };
        el.appendChild(mk('Copy', () => this.copySelectedCell()));
        el.appendChild(mk('Cut', () => { this.copySelectedCell(); this.grid.setCell(this.selected.row, this.selected.col, ''); this.renderGrid(); }));
        el.appendChild(mk('Clear', () => { this.grid.setCell(this.selected.row, this.selected.col, ''); this.renderGrid(); }));
        el.appendChild(mk('Export CSV', () => this.exportResults()));
        return el;
    }

    copySelectedCell() {
        if (this.selected.row == null || this.selected.col == null) return;
        const val = this.grid.getCell(this.selected.row, this.selected.col) ?? '';
        navigator.clipboard?.writeText(val).catch(() => {});
    }

    setSelectedCell(r, c) {
        if (r < 1 || c < 1) return; // Only select data cells
        this.selected = { row: r, col: c };
        this.renderGrid();
    }

    async handlePaste(text) {
        if (this.selected.row == null || this.selected.col == null) return;
        const rows = text.replace(/\r/g, '').split('\n').filter(line => line.length > 0);
        const data = rows.map(line => line.split('\t'));
        const startR = this.selected.row;
        const startC = this.selected.col;

        // Ensure grid is large enough
        const requiredRows = startR + data.length;
        const requiredCols = startC + Math.max(...data.map(r => r.length));
        while (this.grid.rows < requiredRows) this.grid.addRow();
        while (this.grid.cols < requiredCols) this.grid.addCol();

        // Apply
        for (let i = 0; i < data.length; i++) {
            for (let j = 0; j < data[i].length; j++) {
                const val = data[i][j] ?? '';
                this.grid.setCell(startR + i, startC + j, val);
            }
        }
        this.renderGrid();
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', async () => {
    const app = new SmartSpreadsheetApp();
    await app.initializeApp();
}); 