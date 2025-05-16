const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class TunnelManager extends EventEmitter {
  constructor(configStore, keyStore, portAllocator, proxyServer) {
    super();
    this.configStore = configStore;
    this.keyStore = keyStore;
    this.portAllocator = portAllocator;
    this.proxyServer = proxyServer;
    this.activeTunnels = new Map(); // Map of tunnelId -> tunnel info
    this.monitorInterval = null;
  }

  /**
   * Start all tunnels marked as active in config
   */
  async startActiveTunnels() {
    try {
      const groups = this.configStore.getGroups();
      const hosts = this.configStore.getHosts();
      const apps = this.configStore.getApps();
      
      // Filter active apps
      const activeApps = apps.filter(app => app.active);
      
      console.log(`Starting ${activeApps.length} active tunnels...`);
      
      // Start each active app's tunnel
      for (const app of activeApps) {
        try {
          const host = hosts.find(h => h.id === app.hostId);
          if (!host) {
            console.error(`Cannot find host ${app.hostId} for app ${app.name}`);
            continue;
          }
          
          await this.startTunnel(app.id);
          console.log(`Started tunnel for ${app.name}`);
        } catch (err) {
          console.error(`Failed to start tunnel for app ${app.name}:`, err);
        }
      }
      
      // Start monitoring tunnels
      this.startMonitoring();
    } catch (err) {
      console.error('Error starting active tunnels:', err);
      throw err;
    }
  }
  
  /**
   * Start a single tunnel for an app
   * @param {string} appId - The ID of the app to start tunnel for
   * @returns {Promise<object>} - Information about the started tunnel
   */
  async startTunnel(appId) {
    try {
      // Get app config
      const app = this.configStore.getAppById(appId);
      if (!app) {
        throw new Error(`App with ID ${appId} not found`);
      }
      
      // Get host config
      const host = this.configStore.getHostById(app.hostId);
      if (!host) {
        throw new Error(`Host with ID ${app.hostId} not found`);
      }
      
      // Get SSH key
      const keyInfo = await this.keyStore.getKey(host.keyId);
      if (!keyInfo) {
        throw new Error(`SSH key with ID ${host.keyId} not found`);
      }
      
      // Find available local port if not specified
      const localPort = app.localPort || await this.portAllocator.getNextAvailablePort();
      
      // If we didn't have a localPort, update the app config
      if (!app.localPort) {
        app.localPort = localPort;
        await this.configStore.updateApp(app);
      }
      
      // Setup SSH tunnel options
      const sshOptions = [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ExitOnForwardFailure=yes'
      ];
      
      // Add key file
      sshOptions.push('-i', keyInfo.path);
      
      // Add port forwarding
      sshOptions.push('-L', `${localPort}:127.0.0.1:${app.remotePort}`);
      
      // Add host address
      const hostAddress = `${host.username}@${host.hostname}`;
      
      // Add command options
      sshOptions.push('-N'); // No command execution
      
      // Start the SSH process
      const tunnelProcess = spawn('ssh', sshOptions.concat(hostAddress), {
        detached: false, // Keep tied to parent process
      });
      
      // Generate tunnel ID
      const tunnelId = uuidv4();
      
      // Create tunnel info object
      const tunnelInfo = {
        id: tunnelId,
        appId: app.id,
        appName: app.name,
        hostId: host.id,
        hostname: host.hostname,
        username: host.username,
        localPort: localPort,
        remotePort: app.remotePort,
        customDomain: app.customDomain,
        process: tunnelProcess,
        status: 'started',
        startTime: new Date(),
        logs: []
      };
      
      // Save to active tunnels
      this.activeTunnels.set(tunnelId, tunnelInfo);
      
      // Update app status in config
      app.active = true;
      app.tunnelId = tunnelId;
      await this.configStore.updateApp(app);
      
      // Setup event listeners
      tunnelProcess.stdout.on('data', (data) => {
        const logEntry = {
          timestamp: new Date(),
          type: 'stdout',
          message: data.toString()
        };
        
        // Add to logs
        tunnelInfo.logs.push(logEntry);
        
        // Limit logs length
        if (tunnelInfo.logs.length > 100) {
          tunnelInfo.logs.shift();
        }
        
        // Emit log event
        this.emit('tunnel-log', { tunnelId, log: logEntry });
      });
      
      tunnelProcess.stderr.on('data', (data) => {
        const logEntry = {
          timestamp: new Date(),
          type: 'stderr',
          message: data.toString()
        };
        
        // Add to logs
        tunnelInfo.logs.push(logEntry);
        
        // Limit logs length
        if (tunnelInfo.logs.length > 100) {
          tunnelInfo.logs.shift();
        }
        
        // Emit log event
        this.emit('tunnel-log', { tunnelId, log: logEntry });
      });
      
      tunnelProcess.on('close', async (code) => {
        console.log(`Tunnel process for ${app.name} closed with code ${code}`);
        
        // Update status
        tunnelInfo.status = 'stopped';
        tunnelInfo.stopTime = new Date();
        tunnelInfo.exitCode = code;
        
        // Emit event
        this.emit('tunnel-closed', { tunnelId, code });
        
        // Auto-restart if needed
        if (app.autoRestart && code !== 0) {
          console.log(`Auto-restarting tunnel for ${app.name}`);
          setTimeout(() => {
            this.startTunnel(app.id).catch(err => {
              console.error(`Failed to auto-restart tunnel for ${app.name}:`, err);
            });
          }, 5000); // 5 second delay before restart
        }
      });
      
      // Register with proxy server
      this.proxyServer.registerTunnel(app.customDomain, `127.0.0.1:${localPort}`);
      
      // Emit event
      this.emit('tunnel-started', { tunnelId, info: tunnelInfo });
      
      return tunnelInfo;
    } catch (err) {
      console.error(`Error starting tunnel for app ${appId}:`, err);
      throw err;
    }
  }
  
  /**
   * Stop a tunnel
   * @param {string} tunnelId - The ID of the tunnel to stop
   * @returns {Promise<boolean>} - Whether the tunnel was stopped
   */
  async stopTunnel(tunnelId) {
    try {
      // Get tunnel info
      const tunnelInfo = this.activeTunnels.get(tunnelId);
      if (!tunnelInfo) {
        console.warn(`Tunnel with ID ${tunnelId} not found`);
        return false;
      }
      
      // Kill the process
      if (tunnelInfo.process) {
        tunnelInfo.process.kill();
      }
      
      // Update app status in config
      const app = this.configStore.getAppById(tunnelInfo.appId);
      if (app) {
        app.active = false;
        app.tunnelId = null;
        await this.configStore.updateApp(app);
      }
      
      // Unregister from proxy server
      if (tunnelInfo.customDomain) {
        this.proxyServer.unregisterTunnel(tunnelInfo.customDomain);
      }
      
      // Remove from active tunnels
      this.activeTunnels.delete(tunnelId);
      
      // Emit event
      this.emit('tunnel-stopped', { tunnelId });
      
      return true;
    } catch (err) {
      console.error(`Error stopping tunnel ${tunnelId}:`, err);
      throw err;
    }
  }
  
  /**
   * Stop all active tunnels
   * @returns {Promise<void>}
   */
  async stopAllTunnels() {
    try {
      // Stop monitoring
      this.stopMonitoring();
      
      // Get all tunnel IDs
      const tunnelIds = [...this.activeTunnels.keys()];
      
      // Stop each tunnel
      for (const tunnelId of tunnelIds) {
        try {
          await this.stopTunnel(tunnelId);
        } catch (err) {
          console.error(`Error stopping tunnel ${tunnelId}:`, err);
        }
      }
      
      console.log(`Stopped ${tunnelIds.length} tunnels`);
    } catch (err) {
      console.error('Error stopping all tunnels:', err);
      throw err;
    }
  }
  
  /**
   * Get information about all active tunnels
   * @returns {Array<object>} - Array of tunnel info objects
   */
  getActiveTunnels() {
    // Convert Map to Array and remove process object (not serializable)
    return Array.from(this.activeTunnels.values()).map(tunnel => {
      const { process, ...tunnelWithoutProcess } = tunnel;
      return tunnelWithoutProcess;
    });
  }
  
  /**
   * Get information about a specific tunnel
   * @param {string} tunnelId - The ID of the tunnel
   * @returns {object|null} - Tunnel info or null if not found
   */
  getTunnelInfo(tunnelId) {
    const tunnel = this.activeTunnels.get(tunnelId);
    if (!tunnel) return null;
    
    // Return without process object (not serializable)
    const { process, ...tunnelWithoutProcess } = tunnel;
    return tunnelWithoutProcess;
  }
  
  /**
   * Start monitoring active tunnels
   */
  startMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    
    this.monitorInterval = setInterval(() => {
      this.checkTunnelsStatus();
    }, 30000); // Check every 30 seconds
  }
  
  /**
   * Stop monitoring tunnels
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
  
  /**
   * Check the status of all active tunnels
   */
  async checkTunnelsStatus() {
    for (const [tunnelId, tunnelInfo] of this.activeTunnels.entries()) {
      // Skip if process is not running
      if (!tunnelInfo.process || tunnelInfo.status === 'stopped') {
        continue;
      }
      
      // Check if process is still running
      if (tunnelInfo.process.exitCode !== null) {
        console.log(`Tunnel ${tunnelId} process has exited with code ${tunnelInfo.process.exitCode}`);
        
        // Update status
        tunnelInfo.status = 'stopped';
        tunnelInfo.stopTime = new Date();
        tunnelInfo.exitCode = tunnelInfo.process.exitCode;
        
        // Emit event
        this.emit('tunnel-closed', { tunnelId, code: tunnelInfo.process.exitCode });
        
        // Get app config
        const app = this.configStore.getAppById(tunnelInfo.appId);
        
        // Auto-restart if needed
        if (app && app.autoRestart) {
          console.log(`Auto-restarting tunnel for ${app.name}`);
          try {
            await this.startTunnel(app.id);
          } catch (err) {
            console.error(`Failed to auto-restart tunnel for ${app.name}:`, err);
          }
        }
      }
    }
  }
}

module.exports = TunnelManager;