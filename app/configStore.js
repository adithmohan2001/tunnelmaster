const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ConfigStore {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.configPath = path.join(dataPath, 'config.json');
    this.config = {
      groups: [],
      hosts: [],
      apps: [],
      settings: {
        dnsPort: 5353,
        proxyPort: 8080,
        domainSuffix: 'dev.local',
        startMinimized: false,
        autoStartTunnels: true
      }
    };
    this._initialized = false;
  }

  /**
   * Initialize config store
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this._initialized) return;
    
    try {
      // Try to load config
      try {
        const data = await fs.readFile(this.configPath, 'utf8');
        this.config = JSON.parse(data);
      } catch (err) {
        if (err.code === 'ENOENT') {
          // File doesn't exist yet, save default config
          await this._saveConfig();
        } else {
          throw err;
        }
      }
      
      this._initialized = true;
    } catch (err) {
      console.error('Failed to initialize config store:', err);
      throw err;
    }
  }

  /**
   * Save config to file
   * @returns {Promise<void>}
   * @private
   */
  async _saveConfig() {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Get all groups
   * @returns {Promise<Array<object>>} - Array of groups
   */
  async getGroups() {
    await this.initialize();
    return [...this.config.groups];
  }

  /**
   * Get all hosts
   * @returns {Promise<Array<object>>} - Array of hosts
   */
  async getHosts() {
    await this.initialize();
    return [...this.config.hosts];
  }

  /**
   * Get all apps
   * @returns {Promise<Array<object>>} - Array of apps
   */
  async getApps() {
    if (!this.config) {
      await this.initialize();
    }
    return Array.isArray(this.config.apps) ? this.config.apps : [];
  }
    
  
  /**
   * Get settings
   * @returns {Promise<object>} - Settings object
   */
  async getSettings() {
    await this.initialize();
    return { ...this.config.settings };
  }

  /**
   * Update settings
   * @param {object} settings - New settings
   * @returns {Promise<object>} - Updated settings
   */
  async updateSettings(settings) {
    await this.initialize();
    this.config.settings = { ...this.config.settings, ...settings };
    await this._saveConfig();
    return { ...this.config.settings };
  }

  /**
   * Add a group
   * @param {object} group - Group object
   * @returns {Promise<object>} - Created group with ID
   */
  async addGroup(group) {
    await this.initialize();
    
    const newGroup = {
      id: uuidv4(),
      name: group.name,
      description: group.description || '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.config.groups.push(newGroup);
    await this._saveConfig();
    
    return newGroup;
  }

  /**
   * Update a group
   * @param {object} group - Group object with ID
   * @returns {Promise<object|null>} - Updated group or null if not found
   */
  async updateGroup(group) {
    await this.initialize();
    
    const groupIndex = this.config.groups.findIndex(g => g.id === group.id);
    if (groupIndex === -1) return null;
    
    const updatedGroup = {
      ...this.config.groups[groupIndex],
      ...group,
      updatedAt: new Date()
    };
    
    this.config.groups[groupIndex] = updatedGroup;
    await this._saveConfig();
    
    return updatedGroup;
  }

  /**
   * Delete a group
   * @param {string} groupId - Group ID
   * @returns {Promise<boolean>} - Whether the group was found and deleted
   */
  async deleteGroup(groupId) {
    await this.initialize();
    
    const groupIndex = this.config.groups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return false;
    
    // Check if there are hosts in this group
    const hostInGroup = this.config.hosts.some(h => h.groupId === groupId);
    if (hostInGroup) {
      throw new Error('Cannot delete group with hosts');
    }
    
    this.config.groups.splice(groupIndex, 1);
    await this._saveConfig();
    
    return true;
  }

  /**
   * Add a host
   * @param {object} host - Host object
   * @returns {Promise<object>} - Created host with ID
   */
  async addHost(host) {
    await this.initialize();
    
    // Validate that group exists
    const groupExists = this.config.groups.some(g => g.id === host.groupId);
    if (!groupExists) {
      throw new Error(`Group with ID ${host.groupId} not found`);
    }
    
    const newHost = {
      id: uuidv4(),
      name: host.name,
      description: host.description || '',
      groupId: host.groupId,
      hostname: host.hostname,
      port: host.port || 22,
      username: host.username,
      keyId: host.keyId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.config.hosts.push(newHost);
    await this._saveConfig();
    
    return newHost;
  }

  /**
   * Update a host
   * @param {object} host - Host object with ID
   * @returns {Promise<object|null>} - Updated host or null if not found
   */
  async updateHost(host) {
    await this.initialize();
    
    const hostIndex = this.config.hosts.findIndex(h => h.id === host.id);
    if (hostIndex === -1) return null;
    
    // Validate that group exists if changed
    if (host.groupId && host.groupId !== this.config.hosts[hostIndex].groupId) {
      const groupExists = this.config.groups.some(g => g.id === host.groupId);
      if (!groupExists) {
        throw new Error(`Group with ID ${host.groupId} not found`);
      }
    }
    
    const updatedHost = {
      ...this.config.hosts[hostIndex],
      ...host,
      updatedAt: new Date()
    };
    
    this.config.hosts[hostIndex] = updatedHost;
    await this._saveConfig();
    
    return updatedHost;
  }

  /**
   * Delete a host
   * @param {string} hostId - Host ID
   * @returns {Promise<boolean>} - Whether the host was found and deleted
   */
  async deleteHost(hostId) {
    await this.initialize();
    
    const hostIndex = this.config.hosts.findIndex(h => h.id === hostId);
    if (hostIndex === -1) return false;
    
    // Check if there are apps using this host
    const appUsingHost = this.config.apps.some(a => a.hostId === hostId);
    if (appUsingHost) {
      throw new Error('Cannot delete host with apps');
    }
    
    this.config.hosts.splice(hostIndex, 1);
    await this._saveConfig();
    
    return true;
  }

  /**
   * Add an app
   * @param {object} app - App object
   * @returns {Promise<object>} - Created app with ID
   */
  async addApp(app) {
    await this.initialize();
    
    // Validate that host exists
    const hostExists = this.config.hosts.some(h => h.id === app.hostId);
    if (!hostExists) {
      throw new Error(`Host with ID ${app.hostId} not found`);
    }
    
    const newApp = {
      id: uuidv4(),
      name: app.name,
      description: app.description || '',
      hostId: app.hostId,
      remotePort: app.remotePort,
      localPort: app.localPort || null, // Will be assigned when tunnel starts
      customDomain: app.customDomain,
      active: app.active || false,
      autoRestart: app.autoRestart || true,
      tunnelId: null, // Will be assigned when tunnel starts
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.config.apps.push(newApp);
    await this._saveConfig();
    
    return newApp;
  }

  /**
   * Update an app
   * @param {object} app - App object with ID
   * @returns {Promise<object|null>} - Updated app or null if not found
   */
  async updateApp(app) {
    await this.initialize();
    
    const appIndex = this.config.apps.findIndex(a => a.id === app.id);
    if (appIndex === -1) return null;
    
    // Validate that host exists if changed
    if (app.hostId && app.hostId !== this.config.apps[appIndex].hostId) {
      const hostExists = this.config.hosts.some(h => h.id === app.hostId);
      if (!hostExists) {
        throw new Error(`Host with ID ${app.hostId} not found`);
      }
    }
    
    const updatedApp = {
      ...this.config.apps[appIndex],
      ...app,
      updatedAt: new Date()
    };
    
    this.config.apps[appIndex] = updatedApp;
    await this._saveConfig();
    
    return updatedApp;
  }

  /**
   * Delete an app
   * @param {string} appId - App ID
   * @returns {Promise<boolean>} - Whether the app was found and deleted
   */
  async deleteApp(appId) {
    await this.initialize();
    
    const appIndex = this.config.apps.findIndex(a => a.id === appId);
    if (appIndex === -1) return false;
    
    this.config.apps.splice(appIndex, 1);
    await this._saveConfig();
    
    return true;
  }

  /**
   * Get a group by ID
   * @param {string} groupId - Group ID
   * @returns {Promise<object|null>} - Group or null if not found
   */
  async getGroupById(groupId) {
    await this.initialize();
    return this.config.groups.find(g => g.id === groupId) || null;
  }

  /**
   * Get a host by ID
   * @param {string} hostId - Host ID
   * @returns {Promise<object|null>} - Host or null if not found
   */
  async getHostById(hostId) {
    await this.initialize();
    return this.config.hosts.find(h => h.id === hostId) || null;
  }

  /**
   * Get an app by ID
   * @param {string} appId - App ID
   * @returns {Promise<object|null>} - App or null if not found
   */
  async getAppById(appId) {
    await this.initialize();
    return this.config.apps.find(a => a.id === appId) || null;
  }

  /**
   * Get hosts by group ID
   * @param {string} groupId - Group ID
   * @returns {Promise<Array<object>>} - Array of hosts
   */
  async getHostsByGroupId(groupId) {
    await this.initialize();
    return this.config.hosts.filter(h => h.groupId === groupId);
  }

  /**
   * Get apps by host ID
   * @param {string} hostId - Host ID
   * @returns {Promise<Array<object>>} - Array of apps
   */
  async getAppsByHostId(hostId) {
    await this.initialize();
    return this.config.apps.filter(a => a.hostId === hostId);
  }

  /**
   * Get all config data
   * @returns {Promise<object>} - All config data
   */
  async getAll() {
    await this.initialize();
    return { ...this.config };
  }

  /**
   * Import config from file
   * @param {string} filePath - Path to JSON file
   * @returns {Promise<void>}
   */
  async importFromFile(filePath) {
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const config = JSON.parse(data);
      
      // Validate config structure
      if (!config.groups || !config.hosts || !config.apps || !config.settings) {
        throw new Error('Invalid config file format');
      }
      
      this.config = config;
      await this._saveConfig();
    } catch (err) {
      console.error('Failed to import config:', err);
      throw err;
    }
  }

  /**
   * Export config to file
   * @param {string} filePath - Path to save JSON file
   * @returns {Promise<void>}
   */
  async exportToFile(filePath) {
    try {
      await fs.writeFile(filePath, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('Failed to export config:', err);
      throw err;
    }
  }
}

module.exports = ConfigStore;