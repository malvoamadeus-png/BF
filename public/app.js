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

    try {
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, scope, precision })
        });
        const data = await response.json();

        if (data.steps) {
            data.steps.forEach(step => {
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
        }

        resultsContainer.classList.remove('hidden');
        if (data.hasBundle && data.suspects.length > 0) {
            resultsTable.classList.remove('hidden');
            resultsStatus.innerHTML = `<span style="color: var(--accent-red)">⚠ WARNING: ${data.suspects.length} SUSPECT(S) IDENTIFIED</span>`;
            data.suspects.forEach(suspect => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="color: var(--accent-red); font-weight: bold;">${suspect.address}</td>
                    <td>${(suspect.score ?? 0).toFixed(2)}</td>
                    <td>${suspect.count ?? 0}</td>
                    <td>${suspect.totalAnalyzed ?? 0}</td>
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
