const { Tray, Menu, app, dialog } = require('electron');
const path = require('path');

/**
 * Manages the system tray icon and menu
 */
class TrayManager {
  /**
   * Create a new TrayManager
   * @param {Electron.App} app - The Electron app instance
   * @param {TunnelManager} tunnelManager - The tunnel manager instance
   */
  constructor(app, tunnelManager) {
    this.app = app;
    this.tunnelManager = tunnelManager;
    this.tray = null;
    this.iconPath = {
      active: path.join(__dirname, '../assets/icon-active.png'),
      inactive: path.join(__dirname, '../assets/icon-inactive.png')
    };
    
    // Listen for tunnel events to update tray icon
    this.tunnelManager.on('tunnel-started', () => this.updateTrayIcon());
    this.tunnelManager.on('tunnel-stopped', () => this.updateTrayIcon());
    this.tunnelManager.on('tunnel-closed', () => this.updateTrayIcon());
  }

  /**
   * Create the system tray icon and menu
   */
  createTray() {
    if (this.tray) return;

    // Create the tray with initial icon
    this.tray = new Tray(this.getInitialIcon());
    this.tray.setToolTip('Tunnel Master');
    
    // Set context menu
    this.updateTrayMenu();
    
    // Set up double-click to show main window
    this.tray.on('double-click', () => {
      this.showMainWindow();
    });
  }

  /**
   * Get the appropriate icon based on active tunnels
   * @returns {string} - Path to the icon
   */
  getInitialIcon() {
    const activeTunnels = this.tunnelManager.getActiveTunnels();
    return activeTunnels.length > 0 ? this.iconPath.active : this.iconPath.inactive;
  }

  /**
   * Update the tray icon based on active tunnels
   */
  updateTrayIcon() {
    if (!this.tray) return;
    
    const activeTunnels = this.tunnelManager.getActiveTunnels();
    const iconPath = activeTunnels.length > 0 ? this.iconPath.active : this.iconPath.inactive;
    
    this.tray.setImage(iconPath);
    this.updateTrayMenu(); // Also update the menu to reflect current tunnels
  }

  /**
   * Update the tray context menu
   */
  updateTrayMenu() {
    if (!this.tray) return;
    
    const activeTunnels = this.tunnelManager.getActiveTunnels();
    
    // Create tunnel submenu items
    const tunnelMenuItems = activeTunnels.map(tunnel => {
      return {
        label: `${tunnel.appName} (${tunnel.customDomain})`,
        submenu: [
          {
            label: `Local: 127.0.0.1:${tunnel.localPort}`,
            enabled: false
          },
          {
            label: `Remote: ${tunnel.hostname}:${tunnel.remotePort}`,
            enabled: false
          },
          { type: 'separator' },
          {
            label: 'Stop Tunnel',
            click: () => {
              this.tunnelManager.stopTunnel(tunnel.id)
                .catch(err => {
                  dialog.showErrorBox('Error', `Failed to stop tunnel: ${err.message}`);
                });
            }
          },
          {
            label: 'View Logs',
            click: () => {
              this.showTunnelLogs(tunnel.id);
            }
          }
        ]
      };
    });
    
    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Tunnel Master (${activeTunnels.length} active)`,
        enabled: false
      },
      { type: 'separator' },
      ...(tunnelMenuItems.length > 0 ? tunnelMenuItems : [{
        label: 'No active tunnels',
        enabled: false
      }]),
      { type: 'separator' },
      {
        label: 'Start All Tunnels',
        click: async () => {
          try {
            const apps = await this.tunnelManager.configStore.getApps();
            for (const app of apps) {
              if (!app.active) {
                await this.tunnelManager.startTunnel(app.id);
              }
            }
          } catch (err) {
            dialog.showErrorBox('Error', `Failed to start all tunnels: ${err.message}`);
          }
        }
      },
      {
        label: 'Stop All Tunnels',
        click: () => {
          this.tunnelManager.stopAllTunnels()
            .catch(err => {
              dialog.showErrorBox('Error', `Failed to stop all tunnels: ${err.message}`);
            });
        },
        enabled: activeTunnels.length > 0
      },
      { type: 'separator' },
      {
        label: 'Show Main Window',
        click: () => {
          this.showMainWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit Tunnel Master',
        click: () => {
          this.app.quit();
        }
      }
    ]);
    
    this.tray.setContextMenu(contextMenu);
    
    // Update tooltip with active tunnel count
    this.tray.setToolTip(`Tunnel Master (${activeTunnels.length} active)`);
  }

  /**
   * Show the main application window
   */
  showMainWindow() {
    // Find the main window from app windows
    const allWindows = require('electron').BrowserWindow.getAllWindows();
    const mainWindow = allWindows.length > 0 ? allWindows[0] : null;
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      // Main window doesn't exist, create a new one
      const { createWindow } = require('./main');
      createWindow();
    }
  }

  /**
   * Show logs for a specific tunnel
   * @param {string} tunnelId - The ID of the tunnel
   */
  showTunnelLogs(tunnelId) {
    const tunnel = this.tunnelManager.getTunnelInfo(tunnelId);
    if (!tunnel) return;
    
    // This would normally create a new window to show logs
    // Here we'll just get the main window and send a message to show logs
    const allWindows = require('electron').BrowserWindow.getAllWindows();
    const mainWindow = allWindows.length > 0 ? allWindows[0] : null;
    
    if (mainWindow) {
      mainWindow.webContents.send('show-tunnel-logs', { tunnelId });
      
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  }

  /**
   * Destroy the tray icon
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}

module.exports = TrayManager;