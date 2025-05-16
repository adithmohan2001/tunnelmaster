// Group management component
const { ipcRenderer } = require('electron');

// Initialize the groups component
document.addEventListener('DOMContentLoaded', () => {
    // Register for groups data updates
    document.addEventListener('groups-updated', event => {
        updateGroupsList(event.detail);
    });
    
    // Add group button
    document.getElementById('add-group-btn').addEventListener('click', () => {
        showAddGroupModal();
    });
    
    // Add group form submission
    document.getElementById('add-group-form').addEventListener('submit', event => {
        event.preventDefault();
        addGroup();
    });
    
    // Edit group form submission
    document.getElementById('edit-group-form').addEventListener('submit', event => {
        event.preventDefault();
        saveGroupEdit();
    });
    
    // Initialize search
    document.getElementById('search-groups').addEventListener('input', event => {
        const searchTerm = event.target.value.toLowerCase();
        searchGroups(searchTerm);
    });
});

// Update groups list in the UI
function updateGroupsList(groups) {
    const groupsList = document.getElementById('groups-list');
    const emptyMessage = groupsList.querySelector('.empty-message');
    
    // Show or hide empty message
    if (groups.length === 0) {
        if (!emptyMessage) {
            const msg = document.createElement('div');
            msg.className = 'empty-message';
            msg.textContent = 'No groups found';
            groupsList.appendChild(msg);
        }
        return;
    } else if (emptyMessage) {
        emptyMessage.remove();
    }
    
    // Clear existing groups
    const existingGroups = groupsList.querySelectorAll('.group-card:not(.template)');
    existingGroups.forEach(group => group.remove());
    
    // Add group cards
    groups.forEach(group => {
        const groupCard = document.createElement('div');
        groupCard.className = 'group-card';
        groupCard.setAttribute('data-group-id', group.id);
        
        groupCard.innerHTML = `
            <div class="group-info">
                <div class="group-name">${group.name}</div>
                <div class="group-details">
                    <span><i class="fas fa-server"></i> Hosts: ${group.hostIds ? group.hostIds.length : 0}</span>
                    <span><i class="fas fa-code-branch"></i> Apps: ${countGroupApps(group)}</span>
                </div>
                <div class="group-description">${group.description || 'No description'}</div>
            </div>
            <div class="group-actions">
                <button class="btn btn-icon edit-group-btn" title="Edit Group">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="btn btn-icon btn-danger delete-group-btn" title="Delete Group">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        groupCard.querySelector('.edit-group-btn').addEventListener('click', () => {
            editGroup(group.id);
        });
        
        groupCard.querySelector('.delete-group-btn').addEventListener('click', () => {
            deleteGroup(group.id);
        });
        
        groupsList.appendChild(groupCard);
    });
}

// Count apps in a group
function countGroupApps(group) {
    let count = 0;
    if (group.appIds && Array.isArray(group.appIds)) {
        count = group.appIds.length;
    }
    return count;
}

// Show add group modal
function showAddGroupModal() {
    // Reset form
    document.getElementById('add-group-form').reset();
    
    // Show modal
    window.showModal('add-group-modal');
}

// Add a new group
function addGroup() {
    const groupName = document.getElementById('group-name').value;
    const groupDescription = document.getElementById('group-description').value;
    
    if (!groupName) {
        window.showToast('Please provide a group name', 'error');
        return;
    }
    
    const groupData = {
        name: groupName,
        description: groupDescription,
        hostIds: [],
        appIds: []
    };
    
    // Send to main process
    ipcRenderer.send('add-group', groupData);
    
    // Wait for response
    ipcRenderer.once('group-added', (event, result) => {
        if (result.success) {
            window.showToast('Group added successfully', 'success');
            window.closeAllModals();
            
            // Add to state and update UI
            window.appState.groups.push(result.group);
            updateGroupsList(window.appState.groups);
        } else {
            window.showToast(`Failed to add group: ${result.error}`, 'error');
        }
    });
}

// Edit a group
function editGroup(groupId) {
    const group = window.appState.groups.find(g => g.id === groupId);
    if (!group) {
        window.showToast('Group not found', 'error');
        return;
    }
    
    // Fill form with current values
    document.getElementById('edit-group-id').value = group.id;
    document.getElementById('edit-group-name').value = group.name;
    document.getElementById('edit-group-description').value = group.description || '';
    
    // Show hosts and apps
    updateGroupHostsList(group);
    updateGroupAppsList(group);
    
    // Show modal
    window.showModal('edit-group-modal');
}

// Update hosts list in edit group modal
function updateGroupHostsList(group) {
    const hostsList = document.getElementById('edit-group-hosts');
    hostsList.innerHTML = '';
    
    window.appState.hosts.forEach(host => {
        const isSelected = group.hostIds && group.hostIds.includes(host.id);
        
        const hostItem = document.createElement('div');
        hostItem.className = 'checkbox-item';
        
        hostItem.innerHTML = `
            <label>
                <input type="checkbox" name="host" value="${host.id}" ${isSelected ? 'checked' : ''}>
                ${host.name} (${host.hostname})
            </label>
        `;
        
        hostsList.appendChild(hostItem);
    });
    
    if (window.appState.hosts.length === 0) {
        hostsList.innerHTML = '<p class="empty-message">No hosts available</p>';
    }
}

// Update apps list in edit group modal
function updateGroupAppsList(group) {
    const appsList = document.getElementById('edit-group-apps');
    appsList.innerHTML = '';
    
    window.appState.apps.forEach(app => {
        const isSelected = group.appIds && group.appIds.includes(app.id);
        
        const appItem = document.createElement('div');
        appItem.className = 'checkbox-item';
        
        appItem.innerHTML = `
            <label>
                <input type="checkbox" name="app" value="${app.id}" ${isSelected ? 'checked' : ''}>
                ${app.name} (${app.localPort})
            </label>
        `;
        
        appsList.appendChild(appItem);
    });
    
    if (window.appState.apps.length === 0) {
        appsList.innerHTML = '<p class="empty-message">No apps available</p>';
    }
}

// Save group edits
function saveGroupEdit() {
    const groupId = document.getElementById('edit-group-id').value;
    const groupName = document.getElementById('edit-group-name').value;
    const groupDescription = document.getElementById('edit-group-description').value;
    
    if (!groupName) {
        window.showToast('Please provide a group name', 'error');
        return;
    }
    
    // Get selected hosts
    const selectedHosts = Array.from(document.querySelectorAll('#edit-group-hosts input[name="host"]:checked'))
        .map(input => input.value);
    
    // Get selected apps
    const selectedApps = Array.from(document.querySelectorAll('#edit-group-apps input[name="app"]:checked'))
        .map(input => input.value);
    
    const groupData = {
        id: groupId,
        name: groupName,
        description: groupDescription,
        hostIds: selectedHosts,
        appIds: selectedApps
    };
    
    // Send to main process
    ipcRenderer.send('update-group', groupData);
    
    // Wait for response
    ipcRenderer.once('group-updated', (event, result) => {
        if (result.success) {
            window.showToast('Group updated successfully', 'success');
            window.closeAllModals();
            
            // Update in state
            const index = window.appState.groups.findIndex(g => g.id === groupId);
            if (index !== -1) {
                window.appState.groups[index] = result.group;
                updateGroupsList(window.appState.groups);
            }
        } else {
            window.showToast(`Failed to update group: ${result.error}`, 'error');
        }
    });
}

// Delete a group
function deleteGroup(groupId) {
    if (confirm('Are you sure you want to delete this group? This will not delete the associated hosts and apps.')) {
        ipcRenderer.send('delete-group', { groupId });
        
        ipcRenderer.once('group-deleted', (event, result) => {
            if (result.success) {
                window.showToast('Group deleted successfully', 'success');
                
                // Remove from state and UI
                window.appState.groups = window.appState.groups.filter(g => g.id !== groupId);
                updateGroupsList(window.appState.groups);
            } else {
                window.showToast(`Failed to delete group: ${result.error}`, 'error');
            }
        });
    }
}

// Search groups
function searchGroups(searchTerm) {
    if (!searchTerm) {
        // If search is empty, show all groups
        updateGroupsList(window.appState.groups);
        return;
    }
    
    // Filter groups based on search term
    const filteredGroups = window.appState.groups.filter(group => {
        return (
            group.name.toLowerCase().includes(searchTerm) ||
            (group.description && group.description.toLowerCase().includes(searchTerm))
        );
    });
    
    // Update UI with filtered groups
    updateGroupsList(filteredGroups);
}

// Start all tunnels in a group
function startGroupTunnels(groupId) {
    const group = window.appState.groups.find(g => g.id === groupId);
    if (!group) {
        window.showToast('Group not found', 'error');
        return;
    }
    
    ipcRenderer.send('start-group-tunnels', { groupId });
    window.showToast(`Starting tunnels for group: ${group.name}...`, 'info');
}

// Stop all tunnels in a group
function stopGroupTunnels(groupId) {
    const group = window.appState.groups.find(g => g.id === groupId);
    if (!group) {
        window.showToast('Group not found', 'error');
        return;
    }
    
    ipcRenderer.send('stop-group-tunnels', { groupId });
    window.showToast(`Stopping tunnels for group: ${group.name}...`, 'info');
}

// Export functions for use in other files
window.groupsModule = {
    updateGroupsList,
    startGroupTunnels,
    stopGroupTunnels
};