const net = require('net');

class PortAllocator {
  constructor(startPort = 8000, endPort = 9000) {
    this.startPort = startPort;
    this.endPort = endPort;
    this.usedPorts = new Set();
  }

  /**
   * Check if a port is available
   * @param {number} port - Port to check
   * @returns {Promise<boolean>} - Whether the port is available
   */
  async isPortAvailable(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use
          resolve(false);
        } else {
          // Some other error, assume port is not available
          resolve(false);
        }
      });
      
      server.once('listening', () => {
        // Close the server and indicate port is available
        server.close(() => {
          resolve(true);
        });
      });
      
      server.listen(port, '127.0.0.1');
    });
  }

  /**
   * Get the next available port
   * @returns {Promise<number>} - An available port
   */
  async getNextAvailablePort() {
    // Start from startPort
    let port = this.startPort;
    
    // Check each port until we find an available one
    while (port <= this.endPort) {
      // Skip if already marked as used
      if (this.usedPorts.has(port)) {
        port++;
        continue;
      }
      
      // Check if port is available
      const available = await this.isPortAvailable(port);
      if (available) {
        // Mark port as used
        this.usedPorts.add(port);
        return port;
      }
      
      port++;
    }
    
    // No available ports found
    throw new Error(`No available ports found in range ${this.startPort}-${this.endPort}`);
  }

  /**
   * Release a port
   * @param {number} port - Port to release
   */
  releasePort(port) {
    this.usedPorts.delete(port);
  }

  /**
   * Mark a port as used
   * @param {number} port - Port to mark as used
   */
  markPortAsUsed(port) {
    this.usedPorts.add(port);
  }

  /**
   * Get all used ports
   * @returns {Array<number>} - Array of used ports
   */
  getUsedPorts() {
    return [...this.usedPorts];
  }
}

module.exports = PortAllocator;