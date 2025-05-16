#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fs = require('fs');

const ConfigStore = require('../app/configStore');
const KeyStore = require('../app/keyStore');
const PortAllocator = require('../app/portAllocator');
const TunnelManager = require('../app/tunnelManager');
const ProxyServer = require('../app/proxyServer');

const args = process.argv.slice(2);
const command = args[0];

// Paths
const userDataPath = path.join(os.homedir(), '.smarttunnel');
const dataPath = path.join(userDataPath, 'data');

// Ensure data directory exists
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath, { recursive: true });
}

// Setup services
const configStore = new ConfigStore(dataPath);
const keyStore = new KeyStore(dataPath);
const portAllocator = new PortAllocator(8000, 9000);
const proxyServer = new ProxyServer(8080);
const tunnelManager = new TunnelManager(configStore, keyStore, portAllocator, proxyServer);

// CLI Commands
(async () => {
  try {
    await configStore.initialize();
    await keyStore.initialize();
    await proxyServer.start();

    switch (command) {
      case 'list': {
        const apps = await configStore.getApps();
        console.log('\nAvailable Apps:\n');
        apps.forEach(app => {
          console.log(`- ${app.name} (${app.customDomain})`);
          console.log(`  Host ID: ${app.hostId}`);
          console.log(`  Remote Port: ${app.remotePort}`);
          console.log(`  Active: ${app.active ? 'Yes' : 'No'}`);
        });
        break;
      }

      case 'start': {
        const appIdToStart = args[1];
        if (!appIdToStart) {
          console.error('Usage: start <appId>');
          process.exit(1);
        }
        await tunnelManager.startTunnel(appIdToStart);
        console.log(`Started tunnel for app: ${appIdToStart}`);
        break;
      }

      case 'stop': {
        const tunnelIdToStop = args[1];
        if (!tunnelIdToStop) {
          console.error('Usage: stop <tunnelId>');
          process.exit(1);
        }
        await tunnelManager.stopTunnel(tunnelIdToStop);
        console.log(`Stopped tunnel: ${tunnelIdToStop}`);
        break;
      }

      case 'start-all': {
        try {
          const apps = await configStore.getApps();
          console.log('Apps returned from getApps():', apps);
          await tunnelManager.startActiveTunnels();
          console.log(`Started all active tunnels`);
        } catch (err) {
          console.error('Error starting active tunnels:', err);
        }
        break;
      }      

      case 'stop-all': {
        await tunnelManager.stopAllTunnels();
        console.log(`Stopped all tunnels`);
        break;
      }

      default:
        console.log(`
SmartTunnel CLI

Usage:
  list                  List all configured apps
  start <appId>         Start a tunnel for a specific app
  stop <tunnelId>       Stop a specific tunnel
  start-all             Start all active tunnels
  stop-all              Stop all tunnels
`);
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  } finally {
    process.exit(0);
  }
})();
