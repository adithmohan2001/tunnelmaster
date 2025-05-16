// Application management component
const { ipcRenderer } = require('electron');

// Initialize the apps component
document.addEventListener('DOMContentLoaded', () => {
    // Register for apps data updates
    document.addEventListener('apps-updated', event => {
        updateAppsList(event.detail);
    });
    
    // Add app button
    document.getElementById('add-app-btn').addEventListener('click', () => {
        showAddAppModal();
    });
    
    // Add app form submission
    document.getElementById('add-app-form').addEventListener('submit', event => {
        event.preventDefault();
        addApp();
    });
    
    // Edit app form submission
    document.getElementById('edit-app-form').addEventListener('submit', event => {
        event.preventDefault();
        saveAppEdit();
    });
    
    // Initialize search
    document.getElementById('search-apps').addEventListener('input', event => {
        const searchTerm = event.target.value.toLowerCase();
        searchApps(searchTerm);
    });
    
    // Test connection button in add modal
    document.getElementById('test-connection-add').addEventListener('click', () => {
        testConnection('add');
    });
    
    // Test connection button in edit modal
    document.getElementById('test-connection-edit').addEventListener('click', () => {
        testConnection('edit');
    });
});

// Update apps list in the UI
function updateAppsList(apps) {
    const appsList = document.getElementById('apps-list');
    const emptyMessage = appsList.querySelector('.empty-message');
    
    // Show or hide empty message
    if (apps.length === 0) {
        if (!emptyMessage) {
            const msg = document.createElement('div');
            msg.className = 'empty-message';
            msg.textContent = 'No applications found';
            appsList.appendChild(msg);
        }
        return;
    } else if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // Clear existing apps
    const existingApps = appsList.querySelectorAll('.app-card:not(.template)');
    existingApps.forEach(app => app.remove());
    
    // Add app cards
    apps.forEach(app => {
        const appCard = document.createElement('div');
        appCard.className = 'app-card';
        appCard.setAttribute('data-app-id', app.id);
        
        // Find host data if available
        let hostName = 'Not assigned';
        let hostAlias = '';
        if (app.hostId) {
            const host = window.appState.hosts.find(h => h.id === app.hostId);
            if (host) {
                hostName = host.name;
                hostAlias = host.hostname;
            }
        }
        
        // Check if any tunnel is active for this app
        const hasActiveTunnel = window.appState.activeTunnels.some(t => t.appId === app.id);
        const statusClass = hasActiveTunnel ? 'status-active' : 'status-inactive';
        const statusText = hasActiveTunnel ? 'Active' : 'Inactive';
        
        appCard.innerHTML = `
            <div class="app-status ${statusClass}"></div>
            <div class="app-info">
                <div class="app-header">
                    <div class="app-name">${app.name}</div>
                    <div class="app-host">
                        <i class="fas fa-server"></i> ${hostName}
                        ${hostAlias ? `<span class="host-alias">(${hostAlias})</span>` : ''}
                    </div>
                </div>
                <div class="app-details">
                    <div class="app-endpoint">
                        <div class="endpoint local">
                            <i class="fas fa-laptop"></i> Local: 127.0.0.1:${app.localPort}
                        </div>
                        <div class="endpoint remote">
                            <i class="fas fa-globe"></i> Remote: ${app.remoteHost}:${app.remotePort}
                        </div>
                    </div>
                    <div class="app-domain">
                        ${app.customDomain ? `<i class="fas fa-link"></i> ${app.customDomain}` : ''}
                    </div>
                </div>
            </div>
            <div class="app-actions">
                <button class="btn btn-icon ${hasActiveTunnel ? 'btn-danger stop-tunnel-btn' : 'btn-success start-tunnel-btn'}" 
                        title="${hasActiveTunnel ? 'Stop Tunnel' : 'Start Tunnel'}">
                    <i class="fas ${hasActiveTunnel ? 'fa-stop' : 'fa-play'}"></i>
                </button>
                <button class="btn btn-icon edit-app-btn" title="Edit App">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="btn btn-icon btn-danger delete-app-btn" title="Delete App">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const startStopBtn = appCard.querySelector(hasActiveTunnel ? '.stop-tunnel-btn' : '.start-tunnel-btn');
        startStopBtn.addEventListener('click', () => {
            if (hasActiveTunnel) {
                stopAppTunnel(app.id);
            } else {
                startAppTunnel(app.id);
            }
        });
        
        appCard.querySelector('.edit-app-btn').addEventListener('click', () => {
            editApp(app.id);
        });
        
        appCard.querySelector('.delete-app-btn').addEventListener('click', () => {
            deleteApp(app.id);
        });
        
        appsList.appendChild(appCard);
    });
}

// Show add app modal
function showAddAppModal() {
    // Reset form
    document.getElementById('add-app-form').reset();
    
    // Populate hosts dropdown
    populateHostsDropdown('add-app-host');
    
    // Show modal
    window.showModal('add-app-modal');
}

// Populate hosts dropdown
function populateHostsDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    dropdown.innerHTML = '<option value="">Select a host</option>';
    
    window.appState.hosts.forEach(host => {
        const option = document.createElement('option');
        option.value = host.id;
        option.textContent = `${host.name} (${host.hostname})`;
        dropdown.appendChild(option);
    });
}

// Add a new app
function addApp() {
    const appName = document.getElementById('add-app-name').value;
    const hostId = document.getElementById('add-app-host').value;
    const localPort = document.getElementById('add-app-local-port').value;
    const remoteHost = document.getElementById('add-app-remote-host').value;
    const remotePort = document.getElementById('add-app-remote-port').value;
    const customDomain = document.getElementById('add-app-domain').value;
    
    if (!appName || !localPort || !remoteHost || !remotePort) {
        window.showToast('Please fill in all required fields', 'error');
        return;
    }
    
    const appData = {
        name: appName,
        hostId: hostId || null,
        localPort: parseInt(localPort),
        remoteHost: remoteHost,
        remotePort: parseInt(remotePort),
        customDomain: customDomain || null
    };
    
    // Send to main process
    ipcRenderer.send('add-app', appData);
    
    // Wait for response
    ipcRenderer.once('app-added', (event, result) => {
        if (result.success) {
            window.showToast('Application added successfully', 'success');
            window.closeAllModals();
            
            // Add to state and update UI
            window.appState.apps.push(result.app);
            updateAppsList(window.appState.apps);
        } else {
            window.showToast(`Failed to add application: ${result.error}`, 'error');
        }
    });
}

// Edit an app
function editApp(appId) {
    const app = window.appState.apps.find(a => a.id === appId);
    if (!app) {
        window.showToast('Application not found', 'error');
        return;
    }
    
    // Fill form with current values
    document.getElementById('edit-app-id').value = app.id;
    document.getElementById('edit-app-name').value = app.name;
    
    // Populate hosts dropdown and select current host
    populateHostsDropdown('edit-app-host');
    if (app.hostId) {
        document.getElementById('edit-app-host').value = app.hostId;
    }
    
    document.getElementById('edit-app-local-port').value = app.localPort;
    document.getElementById('edit-app-remote-host').value = app.remoteHost;
    document.getElementById('edit-app-remote-port').value = app.remotePort;
    document.getElementById('edit-app-domain').value = app.customDomain || '';
    
    // Show tunnel status
    const hasActiveTunnel = window.appState.activeTunnels.some(t => t.appId === app.id);
    const tunnelStatus = document.getElementById('edit-app-tunnel-status');
    tunnelStatus.textContent = hasActiveTunnel ? 'Active' : 'Inactive';
    tunnelStatus.className = hasActiveTunnel ? 'status-text active' : 'status-text inactive';
    
    // Show/hide appropriate buttons
    document.getElementById('start-tunnel-btn').style.display = hasActiveTunnel ? 'none' : 'inline-flex';
    document.getElementById('stop-tunnel-btn').style.display = hasActiveTunnel ? 'inline-flex' : 'none';
    
    // Show modal
    window.showModal('edit-app-modal');
    
    // Add event listeners for start/stop buttons
    document.getElementById('start-tunnel-btn').onclick = () => {
        startAppTunnel(app.id);
        window.closeAllModals();
    };
    
    document.getElementById('stop-tunnel-btn').onclick = () => {
        stopAppTunnel(app.id);
        window.closeAllModals();
    };
}

// Save app edits
function saveAppEdit() {
    const appId = document.getElementById('edit-app-id').value;
    const appName = document.getElementById('edit-app-name').value;
    const hostId = document.getElementById('edit-app-host').value;
    const localPort = document.getElementById('edit-app-local-port').value;
    const remoteHost = document.getElementById('edit-app-remote-host').value;
    const remotePort = document.getElementById('edit-app-remote-port').value;
    const customDomain = document.getElementById('edit-app-domain').value;
    
    if (!appName || !localPort || !remoteHost || !remotePort) {
        window.showToast('Please fill in all required fields', 'error');
        return;
    }
    
    const appData = {
        id: appId,
        name: appName,
        hostId: hostId || null,
        localPort: parseInt(localPort),
        remoteHost: remoteHost,
        remotePort: parseInt(remotePort),
        customDomain: customDomain || null
    };
    
    // Send to main process
    ipcRenderer.send('update-app', appData);
    
    // Wait for response
    ipcRenderer.once('app-updated', (event, result) => {
        if (result.success) {
            window.showToast('Application updated successfully', 'success');
            window.closeAllModals();
            
            // Update in state
            const index = window.appState.apps.findIndex(a => a.id === appId);
            if (index !== -1) {
                window.appState.apps[index] = result.app;
                updateAppsList(window.appState.apps);
            }
        } else {
            window.showToast(`Failed to update application: ${result.error}`, 'error');
        }
    });
}

// Delete an app
function deleteApp(appId) {
    // Check if tunnel is active
    const hasActiveTunnel = window.appState.activeTunnels.some(t => t.appId === appId);
    if (hasActiveTunnel) {
        if (!confirm('This application has an active tunnel. Deleting it will stop the tunnel. Continue?')) {
            return;
        }
    } else {
        if (!confirm('Are you sure you want to delete this application?')) {
            return;
        }
    }
    
    ipcRenderer.send('delete-app', { appId });
    
    ipcRenderer.once('app-deleted', (event, result) => {
        if (result.success) {
            window.showToast('Application deleted successfully', 'success');
            
            // Remove from state and UI
            window.appState.apps = window.appState.apps.filter(a => a.id !== appId);
            updateAppsList(window.appState.apps);
        } else {
            window.showToast(`Failed to delete application: ${result.error}`, 'error');
        }
    });
}

// Search apps
function searchApps(searchTerm) {
    if (!searchTerm) {
        // If search is empty, show all apps
        updateAppsList(window.appState.apps);
        return;
    }
    
    // Filter apps based on search term
    const filteredApps = window.appState.apps.filter(app => {
        // Search in app name, remote host, and custom domain
        return (
            app.name.toLowerCase().includes(searchTerm) ||
            app.remoteHost.toLowerCase().includes(searchTerm) ||
            (app.customDomain && app.customDomain.toLowerCase().includes(searchTerm))
        );
    });
    
    // Update UI with filtered apps
    updateAppsList(filteredApps);
}

// Start app tunnel
function startAppTunnel(appId) {
    const app = window.appState.apps.find(a => a.id === appId);
    if (!app) {
        window.showToast('Application not found', 'error');
        return;
    }
    
    if (!app.hostId) {
        window.showToast('Cannot start tunnel: No host assigned to this application', 'error');
        return;
    }
    
    ipcRenderer.send('start-tunnel', { appId });
    window.showToast(`Starting tunnel for ${app.name}...`, 'info');
}

// Stop app tunnel
function stopAppTunnel(appId) {
    const app = window.appState.apps.find(a => a.id === appId);
    if (!app) {
        window.showToast('Application not found', 'error');
        return;
    }
    
    // Find tunnel ID for this app
    const tunnel = window.appState.activeTunnels.find(t => t.appId === appId);
    if (!tunnel) {
        window.showToast('No active tunnel found for this application', 'warning');
        return;
    }
    
    ipcRenderer.send('stop-tunnel', { tunnelId: tunnel.id });
    window.showToast(`Stopping tunnel for ${app.name}...`, 'info');
}

// Test connection to the app
function testConnection(mode) {
    // Get values from the appropriate form
    const prefix = mode === 'add' ? 'add-app-' : 'edit-app-';
    const localPort = document.getElementById(`${prefix}local-port`).value;
    
    if (!localPort) {
        window.showToast('Please enter a local port to test', 'error');
        return;
    }
    
    // Send test request to main process
    ipcRenderer.send('test-connection', { port: parseInt(localPort) });
    window.showToast(`Testing connection to 127.0.0.1:${localPort}...`, 'info');
    
    // Handle response
    ipcRenderer.once('test-connection-result', (event, result) => {
        if (result.success) {
            window.showToast(`Connection successful: ${result.message}`, 'success');
        } else {
            window.showToast(`Connection failed: ${result.error}`, 'error');
        }
    });
}

// Export functions for use in other files
window.appsModule = {
    updateAppsList,
    startAppTunnel,
    stopAppTunnel
};
