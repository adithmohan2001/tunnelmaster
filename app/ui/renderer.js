// Main renderer process
const { ipcRenderer } = require('electron');

// Global state
let appState = {
    groups: [],
    hosts: [],
    apps: [],
    keys: [],
    settings: {},
    activeTunnels: []
};

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI components
    initNavigation();
    initEventListeners();
    
    // Receive services ready event from main process
    ipcRenderer.on('services-ready', (event, data) => {
        console.log('Services ready:', data);
        if (data.tunnels) {
            appState.activeTunnels = data.tunnels;
            updateActiveTunnelsList();
        }
        if (data.config) {
            loadConfigData(data.config);
        }
    });
    
    // Request initial data
    ipcRenderer.send('get-config');
    ipcRenderer.send('get-active-tunnels');
    
    // Receive tunnel events
    ipcRenderer.on('tunnel-started', (event, data) => {
        console.log('Tunnel started:', data);
        appState.activeTunnels.push(data.info);
        updateActiveTunnelsList();
        showToast(`Tunnel started: ${data.info.appName}`, 'success');
    });
    
    ipcRenderer.on('tunnel-stopped', (event, data) => {
        console.log('Tunnel stopped:', data);
        appState.activeTunnels = appState.activeTunnels.filter(t => t.id !== data.tunnelId);
        updateActiveTunnelsList();
        showToast(`Tunnel stopped`, 'info');
    });
    
    ipcRenderer.on('tunnel-closed', (event, data) => {
        console.log('Tunnel closed:', data);
        const tunnel = appState.activeTunnels.find(t => t.id === data.tunnelId);
        if (tunnel) {
            showToast(`Tunnel closed: ${tunnel.appName} (code: ${data.code})`, 'warning');
            appState.activeTunnels = appState.activeTunnels.filter(t => t.id !== data.tunnelId);
            updateActiveTunnelsList();
        }
    });
    
    ipcRenderer.on('tunnel-log', (event, data) => {
        console.log('Tunnel log:', data);
        // If logs modal is open for this tunnel, append log
        const logsModal = document.getElementById('tunnel-logs-modal');
        if (logsModal.classList.contains('show')) {
            const tunnelId = logsModal.getAttribute('data-tunnel-id');
            if (tunnelId === data.tunnelId) {
                appendTunnelLog(data.log);
            }
        }
    });
    
    ipcRenderer.on('config-updated', (event, config) => {
        console.log('Config updated:', config);
        loadConfigData(config);
    });
    
    ipcRenderer.on('show-tunnel-logs', (event, data) => {
        showTunnelLogs(data.tunnelId);
    });
});

// Initialize tab navigation
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all navigation items
            navItems.forEach(ni => ni.classList.remove('active'));
            // Add active class to clicked item
            item.classList.add('active');
            
            // Hide all tab contents
            tabContents.forEach(tab => tab.classList.remove('active'));
            // Show the selected tab content
            const tabId = item.getAttribute('data-tab');
            document.getElementById(`${tabId}-content`).classList.add('active');
        });
    });
}

// Initialize global event listeners
function initEventListeners() {
    // Start all tunnels button
    document.getElementById('start-all-tunnels').addEventListener('click', startAllTunnels);
    
    // Stop all tunnels button
    document.getElementById('stop-all-tunnels').addEventListener('click', stopAllTunnels);
    
    // Add Key button
    document.getElementById('add-key-btn').addEventListener('click', () => {
        showModal('add-key-modal');
    });
    
    // Close modals
    document.querySelectorAll('.close-modal, .cancel-modal').forEach(elem => {
        elem.addEventListener('click', closeAllModals);
    });
    
    // Add key form submission
    document.getElementById('add-key-form').addEventListener('submit', event => {
        event.preventDefault();
        addSSHKey();
    });
    
    // Browse key file button
    document.getElementById('browse-key-file').addEventListener('click', () => {
        document.getElementById('key-file').click();
    });
    
    // Update selected file name when file is selected
    document.getElementById('key-file').addEventListener('change', event => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            document.getElementById('selected-key-file').textContent = selectedFile.name;
        } else {
            document.getElementById('selected-key-file').textContent = 'No file selected';
        }
    });
    
    // Clear logs button
    document.getElementById('clear-logs-btn').addEventListener('click', clearTunnelLogs);
    
    // Modal background click to close
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                closeAllModals();
            }
        });
    });
}

// Load configuration data
function loadConfigData(config) {
    appState.groups = config.groups || [];
    appState.hosts = config.hosts || [];
    appState.apps = config.apps || [];
    appState.settings = config.settings || {};
    
    // Update dashboard stats
    updateDashboardStats();
    
    // Update components
    document.dispatchEvent(new CustomEvent('groups-updated', { detail: appState.groups }));
    document.dispatchEvent(new CustomEvent('hosts-updated', { detail: appState.hosts }));
    document.dispatchEvent(new CustomEvent('apps-updated', { detail: appState.apps }));
    document.dispatchEvent(new CustomEvent('settings-updated', { detail: appState.settings }));
    
    // Load SSH keys
    ipcRenderer.send('get-ssh-keys');
    ipcRenderer.once('ssh-keys-loaded', (event, keys) => {
        appState.keys = keys;
        document.dispatchEvent(new CustomEvent('keys-updated', { detail: appState.keys }));
        updateKeysList();
    });
}

// Update dashboard statistics
function updateDashboardStats() {
    document.getElementById('total-groups-count').textContent = appState.groups.length;
    document.getElementById('total-hosts-count').textContent = appState.hosts.length;
    document.getElementById('total-apps-count').textContent = appState.apps.length;
    document.getElementById('active-tunnels-count').textContent = appState.activeTunnels.length;
}

// Update list of active tunnels
function updateActiveTunnelsList() {
    const tunnelsList = document.getElementById('active-tunnels-list');
    const emptyMessage = tunnelsList.querySelector('.empty-message');
    
    // Update active tunnels count
    document.getElementById('active-tunnels-count').textContent = appState.activeTunnels.length;
    
    // Show or hide empty message
    if (appState.activeTunnels.length === 0) {
        if (!emptyMessage) {
            const msg = document.createElement('div');
            msg.className = 'empty-message';
            msg.textContent = 'No active tunnels';
            tunnelsList.appendChild(msg);
        }
        return;
    } else if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // Clear existing tunnels
    const existingCards = tunnelsList.querySelectorAll('.tunnel-card:not(.template)');
    existingCards.forEach(card => card.remove());
    
    // Add tunnel cards
    appState.activeTunnels.forEach(tunnel => {
        const tunnelCard = document.createElement('div');
        tunnelCard.className = 'tunnel-card';
        tunnelCard.setAttribute('data-tunnel-id', tunnel.id);
        
        tunnelCard.innerHTML = `
            <div class="tunnel-info">
                <div class="tunnel-name">${tunnel.appName}</div>
                <div class="tunnel-domain">${tunnel.customDomain}</div>
                <div class="tunnel-details">
                    <span><i class="fas fa-desktop"></i> 127.0.0.1:${tunnel.localPort}</span>
                    <span><i class="fas fa-server"></i> ${tunnel.hostname}:${tunnel.remotePort}</span>
                </div>
            </div>
            <div class="tunnel-actions">
                <button class="btn btn-icon view-logs-btn" title="View Logs">
                    <i class="fas fa-file-alt"></i>
                </button>
                <button class="btn btn-icon btn-danger stop-tunnel-btn" title="Stop Tunnel">
                    <i class="fas fa-stop"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        tunnelCard.querySelector('.stop-tunnel-btn').addEventListener('click', () => {
            stopTunnel(tunnel.id);
        });
        
        tunnelCard.querySelector('.view-logs-btn').addEventListener('click', () => {
            showTunnelLogs(tunnel.id);
        });
        
        tunnelsList.appendChild(tunnelCard);
    });
}

// Update SSH keys list
function updateKeysList() {
    const keysList = document.getElementById('keys-list');
    const emptyMessage = keysList.querySelector('.empty-message');
    
    // Show or hide empty message
    if (appState.keys.length === 0) {
        if (!emptyMessage) {
            const msg = document.createElement('div');
            msg.className = 'empty-message';
            msg.textContent = 'No SSH keys found';
            keysList.appendChild(msg);
        }
        return;
    } else if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // Clear existing keys
    const existingCards = keysList.querySelectorAll('.key-card');
    existingCards.forEach(card => card.remove());
    
    // Add key cards
    appState.keys.forEach(key => {
        const keyCard = document.createElement('div');
        keyCard.className = 'key-card';
        keyCard.setAttribute('data-key-id', key.id);
        
        keyCard.innerHTML = `
            <div class="key-info">
                <div class="key-name">${key.name}</div>
                <div class="key-details">
                    <span><i class="fas fa-calendar-alt"></i> Created: ${new Date(key.createdAt).toLocaleDateString()}</span>
                    <span><i class="fas fa-key"></i> ${key.hasPassphrase ? 'Has passphrase' : 'No passphrase'}</span>
                </div>
            </div>
            <div class="key-actions">
                <button class="btn btn-icon btn-danger delete-key-btn" title="Delete Key">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        keyCard.querySelector('.delete-key-btn').addEventListener('click', () => {
            deleteSSHKey(key.id);
        });
        
        keysList.appendChild(keyCard);
    });
}

// Start all tunnels
function startAllTunnels() {
    ipcRenderer.send('start-all-tunnels');
    showToast('Starting all tunnels...', 'info');
}

// Stop all tunnels
function stopAllTunnels() {
    ipcRenderer.send('stop-all-tunnels');
    showToast('Stopping all tunnels...', 'info');
}

// Stop a specific tunnel
function stopTunnel(tunnelId) {
    ipcRenderer.send('stop-tunnel', { tunnelId });
    showToast('Stopping tunnel...', 'info');
}

// Show tunnel logs
function showTunnelLogs(tunnelId) {
    const tunnel = appState.activeTunnels.find(t => t.id === tunnelId);
    if (!tunnel) {
        showToast('Tunnel not found', 'error');
        return;
    }
    
    const modal = document.getElementById('tunnel-logs-modal');
    modal.setAttribute('data-tunnel-id', tunnelId);
    document.getElementById('tunnel-logs-title').textContent = tunnel.appName;
    
    // Clear existing logs
    const logsContainer = document.getElementById('tunnel-logs-content');
    logsContainer.innerHTML = '';
    
    // Request logs from main process
    ipcRenderer.send('get-tunnel-logs', { tunnelId });
    ipcRenderer.once('tunnel-logs-loaded', (event, logs) => {
        logs.forEach(log => appendTunnelLog(log));
        showModal('tunnel-logs-modal');
    });
}

// Append a log entry to the tunnel logs modal
function appendTunnelLog(log) {
    const logsContainer = document.getElementById('tunnel-logs-content');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${log.type}`;
    
    const time = new Date(log.timestamp).toLocaleTimeString();
    logEntry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-message">${log.message}</span>`;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Clear tunnel logs
function clearTunnelLogs() {
    const logsContainer = document.getElementById('tunnel-logs-content');
    logsContainer.innerHTML = '';
    
    const tunnelId = document.getElementById('tunnel-logs-modal').getAttribute('data-tunnel-id');
    ipcRenderer.send('clear-tunnel-logs', { tunnelId });
    showToast('Logs cleared', 'info');
}

// Add a new SSH key
function addSSHKey() {
    const keyName = document.getElementById('key-name').value;
    const keyFile = document.getElementById('key-file').files[0];
    const passphrase = document.getElementById('key-passphrase').value;
    
    if (!keyName || !keyFile) {
        showToast('Please provide a name and key file', 'error');
        return;
    }
    
    // Read key file
    const reader = new FileReader();
    reader.onload = event => {
        const keyContent = event.target.result;
        
        // Send to main process
        ipcRenderer.send('add-ssh-key', {
            name: keyName,
            content: keyContent,
            passphrase: passphrase || null
        });
        
        // Wait for response
        ipcRenderer.once('ssh-key-added', (event, result) => {
            if (result.success) {
                showToast('SSH key added successfully', 'success');
                closeAllModals();
                
                // Reset form
                document.getElementById('key-name').value = '';
                document.getElementById('key-file').value = '';
                document.getElementById('key-passphrase').value = '';
                document.getElementById('selected-key-file').textContent = 'No file selected';
                
                // Reload keys
                ipcRenderer.send('get-ssh-keys');
            } else {
                showToast(`Failed to add SSH key: ${result.error}`, 'error');
            }
        });
    };
    reader.readAsText(keyFile);
}

// Delete an SSH key
function deleteSSHKey(keyId) {
    if (confirm('Are you sure you want to delete this SSH key? This cannot be undone.')) {
        ipcRenderer.send('delete-ssh-key', { keyId });
        
        ipcRenderer.once('ssh-key-deleted', (event, result) => {
            if (result.success) {
                showToast('SSH key deleted successfully', 'success');
                
                // Remove from state and UI
                appState.keys = appState.keys.filter(k => k.id !== keyId);
                updateKeysList();
            } else {
                showToast(`Failed to delete SSH key: ${result.error}`, 'error');
            }
        });
    }
}

// Show modal
function showModal(modalId) {
    closeAllModals();
    const modal = document.getElementById(modalId);
    modal.classList.add('show');
    document.body.classList.add('modal-open');
}

// Close all modals
function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
    document.body.classList.remove('modal-open');
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Add icon based on type
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas fa-${icon}"></i></div>
        <div class="toast-message">${message}</div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Remove after timeout
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Export functions for use in component files
window.appState = appState;
window.showToast = showToast;
window.showModal = showModal;
window.closeAllModals = closeAllModals;