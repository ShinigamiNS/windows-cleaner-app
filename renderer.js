const { scanFiles, scanRegistry, deleteItems, SCAN_DEFINITIONS } = require('./scanner.js');
const { shell } = require('electron');

// --- State ---
let currentResults = [];
let currentMode = 'cleaner';

// --- DOM Elements ---
const views = {
    config: document.getElementById('scan-config-container'),
    review: document.getElementById('scan-review-container')
};

const trees = {
    system: document.getElementById('tree-system'),
    applications: document.getElementById('tree-applications'),
    deepscan: document.getElementById('tree-deepscan'),
    registry: document.getElementById('tree-registry')
};

const resultsList = document.getElementById('results-list');
const totalSizeEl = document.getElementById('total-size');
const configStatusEl = document.getElementById('config-status');
const scanBtn = document.getElementById('scan-btn');
const backupContainer = document.getElementById('backup-container');
const backupCheckbox = document.getElementById('backup-check');

// --- Initialization ---

function init() {
    renderConfigTree('system', SCAN_DEFINITIONS.system);
    renderConfigTree('applications', SCAN_DEFINITIONS.applications);
    renderConfigTree('deepscan', SCAN_DEFINITIONS.deepscan);
    renderConfigTree('registry', SCAN_DEFINITIONS.registry);

    scanBtn.addEventListener('click', runScan);
    document.getElementById('clean-btn').addEventListener('click', runClean);
    document.getElementById('back-to-config-btn').addEventListener('click', () => {
        views.review.style.display = 'none';
        views.config.style.display = 'flex';
        // Reset button text
        scanBtn.disabled = false;
        scanBtn.textContent = "Analyze";
    });

    // Sidebar
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            if (view) {
                document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                handleSidebarNav(view);
            }
        });
    });
}

function handleSidebarNav(view) {
    const cleanerConfig = document.getElementById('cleaner-config');
    const registryConfig = document.getElementById('registry-config');
    const pageTitle = document.getElementById('page-title');

    // Always reset to config view when switching tabs
    views.review.style.display = 'none';
    views.config.style.display = 'flex';
    currentResults = []; // Clear results when switching

    if (view === 'registry') {
        currentMode = 'registry';
        cleanerConfig.style.display = 'none';
        registryConfig.style.display = 'block';
        pageTitle.innerHTML = '<i class="fas fa-registered"></i> Registry Cleanup';
        scanBtn.textContent = "Scan for Issues";
    } else if (view === 'cleaner') {
        currentMode = 'cleaner';
        registryConfig.style.display = 'none';
        cleanerConfig.style.display = 'block';
        pageTitle.innerHTML = '<i class="fas fa-shield-alt"></i> System Cleanup';
        scanBtn.textContent = "Analyze PC";
    } else {
        // Settings
    }
}

function renderConfigTree(categoryKey, items) {
    const container = trees[categoryKey];
    if (!container) return;
    container.innerHTML = '';

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'tree-item';
        div.innerHTML = `
            <input type="checkbox" id="chk-${item.id}" checked data-id="${item.id}">
            <label for="chk-${item.id}">${item.name}</label>
        `;
        container.appendChild(div);
    });
}

function getConfiguration() {
    const config = {};
    const inputs = document.querySelectorAll('.tree-item input[type="checkbox"]');
    inputs.forEach(input => {
        config[input.dataset.id] = input.checked;
    });
    return config;
}

// --- Scanning ---

async function runScan() {
    configStatusEl.textContent = 'Scanning...';
    scanBtn.disabled = true;

    const config = getConfiguration();

    setTimeout(async () => {
        try {
            if (currentMode === 'cleaner') {
                currentResults = await scanFiles(config);
            } else {
                currentResults = await scanRegistry(config);
            }

            renderResults(currentResults);

            // Switch to Review View
            views.config.style.display = 'none';
            views.review.style.display = 'flex';

            // Show/Hide Backup Checkbox
            backupContainer.style.display = (currentMode === 'registry') ? 'flex' : 'none';

            configStatusEl.textContent = 'Ready.';
        } catch (e) {
            configStatusEl.textContent = 'Error: ' + e.message;
        } finally {
            scanBtn.disabled = false;
        }
    }, 100);
}

function renderResults(results) {
    resultsList.innerHTML = '';

    if (results.length === 0) {
        resultsList.innerHTML = '<div style="padding:20px; text-align:center;">No items found.</div>';
        updateStats();
        return;
    }

    const groups = {};
    results.forEach(item => {
        const key = `${item.category} > ${item.group}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });

    Object.keys(groups).sort().forEach(groupName => {
        const groupItems = groups[groupName];

        // Header
        const header = document.createElement('div');
        header.className = 'result-group-header';
        header.style.cursor = 'pointer';

        const groupCheck = document.createElement('input');
        groupCheck.type = 'checkbox';
        groupCheck.checked = true;
        groupCheck.onclick = (e) => e.stopPropagation();
        groupCheck.onchange = (e) => toggleGroup(groupItems, e.target.checked);

        const icon = document.createElement('i');
        icon.className = 'fas fa-chevron-down';
        icon.style.marginRight = '10px';
        icon.style.width = '15px';

        const title = document.createElement('span');
        title.textContent = `${groupName} (${groupItems.length} items)`;
        title.style.marginLeft = '10px';
        title.style.flex = '1';

        header.appendChild(icon);
        header.appendChild(groupCheck);
        header.appendChild(title);
        resultsList.appendChild(header);

        // Items
        const itemContainer = document.createElement('div');

        // Toggle Logic
        header.onclick = () => {
            const isHidden = itemContainer.style.display === 'none';
            itemContainer.style.display = isHidden ? 'block' : 'none';
            icon.className = isHidden ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
        };

        groupItems.forEach(item => {
            const itemRow = document.createElement('div');
            itemRow.className = 'result-item';

            const itemCheck = document.createElement('input');
            itemCheck.type = 'checkbox';
            itemCheck.checked = item.checked;
            item.checkBoxRef = itemCheck;

            itemCheck.onchange = (e) => {
                item.checked = e.target.checked;
                updateStats();
            };

            const pathSpan = document.createElement('span');
            pathSpan.className = 'path';
            pathSpan.textContent = item.path;

            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'size';
            sizeSpan.textContent = item.type === 'registry' ? 'Invalid Entry' : formatBytes(item.size);

            itemRow.appendChild(itemCheck);
            itemRow.appendChild(pathSpan);
            itemRow.appendChild(sizeSpan);
            itemContainer.appendChild(itemRow);
        });
        resultsList.appendChild(itemContainer);
    });

    updateStats();
}

function toggleGroup(items, checked) {
    items.forEach(item => {
        item.checked = checked;
        if (item.checkBoxRef) item.checkBoxRef.checked = checked;
    });
    updateStats();
}

function updateStats() {
    const selected = currentResults.filter(i => i.checked);
    if (currentMode === 'registry') {
        totalSizeEl.textContent = `${selected.length} Issues`;
    } else {
        const totalBytes = selected.reduce((sum, item) => sum + item.size, 0);
        totalSizeEl.textContent = formatBytes(totalBytes);
    }
}

async function runClean() {
    const btn = document.getElementById('clean-btn');
    btn.textContent = 'Cleaning...';
    btn.disabled = true;

    const doBackup = backupCheckbox.checked;

    try {
        const report = await deleteItems(currentResults, { backup: doBackup });
        alert(`Cleaned ${report.count} items.`);

        if (doBackup && currentMode === 'registry') {
            alert('Registry Backup was saved to the "backups" folder in the app directory.');
        }

        views.review.style.display = 'none';
        views.config.style.display = 'flex';
        currentResults = [];
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.textContent = 'Run Cleaner';
        btn.disabled = false;
    }
}

function formatBytes(bytes) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

init();
