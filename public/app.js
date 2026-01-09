// ⚠️ 关键修改：改为相对路径 "/api"
// 这样会自动适配本地代理(Vite)和线上代理(Vercel)，解决 HTTPS 报错问题
const API_URL = "/api";

function scrollToTool() {
    document.getElementById('tool').scrollIntoView({ behavior: 'smooth' });
}

document.getElementById('analyzeBtn').addEventListener('click', async () => {
    const address = document.getElementById('address').value.trim();
    const scope = document.getElementById('scope').value;
    const precision = document.getElementById('precision').value;
    const btn = document.getElementById('analyzeBtn');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.loading-spinner');
    
    const logsContainer = document.getElementById('logs');
    const logSection = document.getElementById('log-container');
    const resultsContainer = document.getElementById('results-container');
    const resultsTable = document.getElementById('results-table');
    const resultsStatus = document.getElementById('results-status');
    const tbody = resultsTable.querySelector('tbody');

    if (!address) {
        alert('Please enter a target address.');
        return;
    }

    // Reset UI
    logsContainer.innerHTML = '';
    logSection.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    resultsTable.classList.add('hidden');
    resultsStatus.innerHTML = '';
    tbody.innerHTML = '';
    
    // Loading State
    btn.disabled = true;
    btnText.textContent = "SCANNING NETWORK...";
    spinner.classList.remove('hidden');

    const desiredTokenCount = scope === 'low' ? 30 : scope === 'middle' ? 50 : 100;

    // Initialize Status Steps
    const stepsUi = [
        { name: 'Confirm target', status: 'running', message: `Address: ${address}` },
        { name: 'Fetch tokens', status: 'pending', message: `Target ${desiredTokenCount}` },
        { name: 'Fetch trades', status: 'pending', message: '' },
        { name: 'Analyze data', status: 'pending', message: '' }
    ];
    
    stepsUi.forEach(step => logsContainer.appendChild(renderStepEntry(step)));

    try {
        // UI Update: Start
        stepsUi[0].status = 'ok';
        updateLastLogStatus(logsContainer, 0, stepsUi[0]);
        stepsUi[1].status = 'running';
        updateLastLogStatus(logsContainer, 1, stepsUi[1]);

        // ⚠️ 请求路径现在是 /api/analyze
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, scope, precision, desiredTokenCount })
        });
        
        if (!response.ok) {
            throw new Error(`Server Error: ${response.status}`);
        }

        const data = await response.json();

        // Process Steps from Backend
        if (data.steps) {
            data.steps.forEach(step => {
                const text = `${step.name ?? ''} ${step.message ?? ''}`.toLowerCase();
                if (text.includes('supabase') || text.includes('database')) return;
                
                // Add detail logs
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry';
                let statusClass = 'log-status-pending';
                let icon = '[ ]';
                
                if (step.status === 'running') { statusClass = 'log-status-running'; icon = '[~]'; }
                else if (step.status === 'ok' || step.status === 'completed') { statusClass = 'log-status-completed'; icon = '[✓]'; }
                else if (step.status === 'failed' || step.status === 'error') { statusClass = 'log-status-failed'; icon = '[X]'; }
                
                // Only append if it's a new distinct step or meaningful log
                // logEntry.innerHTML = `<span class="${statusClass}">${icon} ${step.ts ?? ''}</span> ${step.message ?? ''}`;
                // logsContainer.appendChild(logEntry);
            });

            // Update UI Steps based on backend response
            const fetchTokensStep = data.steps.find(s => (s.name ?? '').toLowerCase().includes('fetch token'));
            if (fetchTokensStep) {
                stepsUi[1].status = fetchTokensStep.status === 'failed' ? 'failed' : 'ok';
                stepsUi[1].message = fetchTokensStep.message ?? stepsUi[1].message;
                updateLastLogStatus(logsContainer, 1, stepsUi[1]);
            }

            const tradesStep = data.steps.find(s => (s.name ?? '').toLowerCase().includes('fetch trading'));
            if (tradesStep) {
                stepsUi[2].status = tradesStep.status === 'failed' ? 'failed' : 'ok';
                stepsUi[2].message = tradesStep.message ?? '';
                updateLastLogStatus(logsContainer, 2, stepsUi[2]);
            }
            
            const analyzeStep = data.steps.find(s => (s.name ?? '').toLowerCase().includes('analyze'));
            if (analyzeStep) {
                stepsUi[3].status = analyzeStep.status === 'failed' ? 'failed' : 'ok';
                stepsUi[3].message = analyzeStep.message ?? '';
                updateLastLogStatus(logsContainer, 3, stepsUi[3]);
            }
        }

        // Show Results
        resultsContainer.classList.remove('hidden');
        const filtered = (data.suspects || []).filter(s => (s.score ?? 0) >= 0.2);
        
        if (filtered.length > 0) {
            resultsTable.classList.remove('hidden');
            resultsStatus.innerHTML = `<span style="color: var(--accent-red)">⚠ WARNING: ${filtered.length} SUSPECT(S) IDENTIFIED (Score ≥ 0.2)</span>`;
            
            filtered.forEach(suspect => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="color: var(--accent-red); font-weight: bold;">${suspect.address}</td>
                    <td>${(suspect.score ?? 0).toFixed(2)}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            resultsStatus.innerHTML = `<span style="color: var(--accent-green)">✓ SYSTEM CLEAN: No Bundle Detected (All scores < 0.2)</span>`;
        }
    } catch (error) {
        console.error('Error:', error);
        logsContainer.innerHTML += `<div class="log-entry"><span class="log-status-failed">[X] CRITICAL ERROR: ${error.message}. Is backend running?</span></div>`;
        // Mark all remaining steps as failed
        stepsUi.forEach((step, idx) => {
            if (step.status === 'pending' || step.status === 'running') {
                step.status = 'failed';
                updateLastLogStatus(logsContainer, idx, step);
            }
        });
    } finally {
        btn.disabled = false;
        btnText.textContent = "ACTIVATE GOD EYE";
        spinner.classList.add('hidden');
    }
});

function renderStepEntry(step) {
    const div = document.createElement('div');
    updateStepVisuals(div, step);
    return div;
}

function updateLastLogStatus(container, index, step) {
    const entry = container.children[index];
    if (entry) updateStepVisuals(entry, step);
}

function updateStepVisuals(element, step) {
    const statusClass = step.status === 'running' ? 'log-status-running' :
        step.status === 'ok' ? 'log-status-completed' :
        step.status === 'failed' ? 'log-status-failed' : 'log-status-pending';
    
    const icon = step.status === 'running' ? '[~]' :
        step.status === 'ok' ? '[✓]' :
        step.status === 'failed' ? '[X]' : '[ ]';
        
    element.innerHTML = `<span class="${statusClass}">${icon} ${step.name}</span> ${step.message ?? ''}`;
}