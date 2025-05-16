const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const dns = require('dns');

// Import custom modules
const TunnelManager = require('./tunnelManager');
const DNSServer = require('./dnsServer');
const ProxyServer = require('./proxyServer');
const ConfigStore = require('./configStore');
const KeyStore = require('./keyStore');
const PortAllocator = require('./portAllocator');
const TrayManager = require('./trayManager');

// Global references
let mainWindow;
let tunnelManager;
let dnsServer;
let proxyServer;
let configStore;
let keyStore;
let portAllocator;
let trayManager;

// Configuration constants
const DNS_PORT = 5353;
const PROXY_PORT = 8080;
const PORT_RANGE_START = 8000;
const PORT_RANGE_END = 9000;
const DOMAIN_SUFFIX = 'dev.local';

// Ensure data directory exists
const ensureDataDirectory = () => {
  const userDataPath = app.getPath('userData');
  const dataPath = path.join(userDataPath, 'data');
  
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  
  return dataPath;
};

// Initialize app
async function initializeApp() {
  const dataPath = ensureDataDirectory();
  
  // Initialize storage and services
  configStore = new ConfigStore(dataPath);
  keyStore = new KeyStore(dataPath);
  portAllocator = new PortAllocator(PORT_RANGE_START, PORT_RANGE_END);
  
  // Start DNS server
  dnsServer = new DNSServer(DNS_PORT, DOMAIN_SUFFIX);
  await dnsServer.start();
  
  // Start proxy server
  proxyServer = new ProxyServer(PROXY_PORT);
  await proxyServer.start();
  
  // Initialize tunnel manager
  tunnelManager = new TunnelManager(configStore, keyStore, portAllocator, proxyServer);
  
  // Set DNS servers for application
  dns.setServers([`127.0.0.1:${DNS_PORT}`]);
  
  // Start active tunnels
  await tunnelManager.startActiveTunnels();
  
  // Initialize tray
  trayManager = new TrayManager(app, tunnelManager);
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'ui/preload.js')
    }
  });

  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'ui/index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Pass services to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('services-ready', {
      tunnels: tunnelManager.getActiveTunnels(),
      config: configStore.getAll()
    });
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Configuration',
          click: importConfig
        },
        {
          label: 'Export Configuration',
          click: exportConfig
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q',
          click: () => { app.quit(); }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Tunnel Master',
          click: showAbout
        }
      ]
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Import config from file
function importConfig() {
  dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      configStore.importFromFile(filePath)
        .then(() => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Import Successful',
            message: 'Configuration imported successfully!'
          });
          mainWindow.webContents.send('config-updated', configStore.getAll());
        })
        .catch(err => {
          dialog.showErrorBox('Import Failed', `Error: ${err.message}`);
        });
    }
  });
}

// Export config to file
function exportConfig() {
  dialog.showSaveDialog(mainWindow, {
    title: 'Export Configuration',
    defaultPath: path.join(app.getPath('downloads'), 'tunnel-master-config.json'),
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  }).then(result => {
    if (!result.canceled && result.filePath) {
      configStore.exportToFile(result.filePath)
        .then(() => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Export Successful',
            message: 'Configuration exported successfully!'
          });
        })
        .catch(err => {
          dialog.showErrorBox('Export Failed', `Error: ${err.message}`);
        });
    }
  });
}

// Show about dialog
function showAbout() {
  dialog.showMessageBox(mainWindow, {
    title: 'About Tunnel Master',
    message: 'Tunnel Master',
    detail: 'Version 1.0.0\nA zero-config local tunnel manager with custom DNS and built-in proxy.',
    buttons: ['OK']
  });
}

// App ready
app.on('ready', async () => {
  try {
    await initializeApp();
    createWindow();
    trayManager.createTray();
  } catch (error) {
    console.error('Failed to initialize app:', error);
    dialog.showErrorBox('Initialization Error', 
      `Failed to start Tunnel Master: ${error.message}\n\nThe application will now quit.`);
    app.quit();
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Clean up before quitting
app.on('before-quit', async () => {
  await tunnelManager.stopAllTunnels();
  await dnsServer.stop();
  await proxyServer.stop();
});