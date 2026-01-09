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

    logsContainer.innerHTML = '';
    logSection.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    resultsTable.classList.add('hidden');
    resultsStatus.innerHTML = '';
    tbody.innerHTML = '';
    
    btn.disabled = true;
    btnText.textContent = "SCANNING NETWORK...";
    spinner.classList.remove('hidden');

    // Desired token count mapping for front-end target display
    const desiredTokenCount = scope === 'low' ? 30 : scope === 'middle' ? 50 : 100;

    // Initialize 4-step status
    const stepsUi = [
        { name: 'Confirm target', status: 'running', message: `Address: ${address}` },
        { name: 'Fetch tokens', status: 'pending', message: `Target ${desiredTokenCount}` },
        { name: 'Fetch trades', status: 'pending', message: '' },
        { name: 'Analyze data', status: 'pending', message: '' }
    ];
    logsContainer.appendChild(renderStepEntry(stepsUi[0]));
    logsContainer.appendChild(renderStepEntry(stepsUi[1]));
    logsContainer.appendChild(renderStepEntry(stepsUi[2]));
    logsContainer.appendChild(renderStepEntry(stepsUi[3]));

    try {
        // Update UI: start fetching tokens
        stepsUi[0].status = 'ok';
        updateLastLogStatus(logsContainer, 0, stepsUi[0]);
        stepsUi[1].status = 'running';
        updateLastLogStatus(logsContainer, 1, stepsUi[1]);

        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, scope, precision, desiredTokenCount })
        });
        const data = await response.json();

        // Update tokens step from backend info if present
        if (data.steps) {
            // Filter out any Supabase/database related entries
            data.steps.forEach(step => {
                const text = `${step.name ?? ''} ${step.message ?? ''}`.toLowerCase();
                if (text.includes('supabase') || text.includes('database')) return;
                const logEntry = document.createElement('div');
                logEntry.className = 'log-entry';
                
                let statusClass = 'log-status-pending';
                let icon = '[ ]';
                if (step.status === 'running') { statusClass = 'log-status-running'; icon = '[~]'; }
                else if (step.status === 'ok' || step.status === 'completed') { statusClass = 'log-status-completed'; icon = '[✓]'; }
                else if (step.status === 'failed' || step.status === 'error') { statusClass = 'log-status-failed'; icon = '[X]'; }
                logEntry.innerHTML = `<span class="${statusClass}">${icon} ${step.ts ?? step.timestamp ?? ''}</span> ${step.message ?? ''}`;
                logsContainer.appendChild(logEntry);
            });
            const fetchTokensStep = data.steps.find(s => (s.name ?? '').toLowerCase().includes('fetch token'));
            if (fetchTokensStep) {
                stepsUi[1].status = fetchTokensStep.status === 'failed' ? 'failed' : 'ok';
                stepsUi[1].message = fetchTokensStep.message ?? stepsUi[1].message;
                updateLastLogStatus(logsContainer, 1, stepsUi[1]);
            } else {
                stepsUi[1].status = 'ok';
                updateLastLogStatus(logsContainer, 1, stepsUi[1]);
            }
            const tradesStep = data.steps.find(s => (s.name ?? '').toLowerCase().includes('fetch trading'));
            stepsUi[2].status = tradesStep && tradesStep.status === 'failed' ? 'failed' : 'ok';
            stepsUi[2].message = tradesStep?.message ?? '';
            updateLastLogStatus(logsContainer, 2, stepsUi[2]);
            const analyzeStep = data.steps.find(s => (s.name ?? '').toLowerCase().includes('analyze'));
            stepsUi[3].status = analyzeStep && analyzeStep.status === 'failed' ? 'failed' : 'ok';
            stepsUi[3].message = analyzeStep?.message ?? '';
            updateLastLogStatus(logsContainer, 3, stepsUi[3]);
        }

        resultsContainer.classList.remove('hidden');
        // Filter suspects by score >= 0.2
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
        logsContainer.innerHTML += `<div class="log-entry"><span class="log-status-failed">[X] CRITICAL ERROR: Connection to server failed.</span></div>`;
    } finally {
        btn.disabled = false;
        btnText.textContent = "ACTIVATE GOD EYE";
        spinner.classList.add('hidden');
    }
});

function renderStepEntry(step) {
    const div = document.createElement('div');
    const statusClass = step.status === 'running' ? 'log-status-running' :
        step.status === 'ok' ? 'log-status-completed' :
        step.status === 'failed' ? 'log-status-failed' : 'log-status-pending';
    const icon = step.status === 'running' ? '[~]' :
        step.status === 'ok' ? '[✓]' :
        step.status === 'failed' ? '[X]' : '[ ]';
    div.className = 'log-entry';
    div.innerHTML = `<span class="${statusClass}">${icon} ${step.name}</span> ${step.message ?? ''}`;
    return div;
}

function updateLastLogStatus(container, index, step) {
    const entry = container.children[index];
    if (!entry) return;
    const statusClass = step.status === 'running' ? 'log-status-running' :
        step.status === 'ok' ? 'log-status-completed' :
        step.status === 'failed' ? 'log-status-failed' : 'log-status-pending';
    const icon = step.status === 'running' ? '[~]' :
        step.status === 'ok' ? '[✓]' :
        step.status === 'failed' ? '[X]' : '[ ]';
    entry.innerHTML = `<span class="${statusClass}">${icon} ${step.name}</span> ${step.message ?? ''}`;
}
