const http = require('http');
const httpProxy = require('http-proxy');

class ProxyServer {
  constructor(port = 8080) {
    this.port = port;
    this.server = null;
    this.proxy = httpProxy.createProxyServer({});
    this.routes = new Map(); // Map of hostname -> target
  }

  /**
   * Start the proxy server
   * @returns {Promise<void>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        // Create server
        this.server = http.createServer((req, res) => {
          // Get hostname from request
          const hostname = req.headers.host.split(':')[0];
          
          console.log(`Proxy request: ${hostname} ${req.url}`);
          
          // Check if we have a route for this hostname
          if (this.routes.has(hostname)) {
            const target = this.routes.get(hostname);
            
            // Add protocol if missing
            const targetUrl = target.startsWith('http') ? target : `http://${target}`;
            
            // Proxy the request
            this.proxy.web(req, res, { target: targetUrl }, (err) => {
              if (err) {
                console.error(`Proxy error for ${hostname}:`, err);
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end(`Proxy error: ${err.message}`);
              }
            });
          } else {
            // No route found, return 404
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`Host not found: ${hostname}`);
          }
        });
        
        // Handle proxy errors
        this.proxy.on('error', (err, req, res) => {
          console.error('Proxy error:', err);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Proxy error: ${err.message}`);
        });
        
        // Start listening
        this.server.listen(this.port, '127.0.0.1', () => {
          console.log(`Proxy server started on 127.0.0.1:${this.port}`);
          resolve();
        });
      } catch (err) {
        console.error('Failed to start proxy server:', err);
        reject(err);
      }
    });
  }

  /**
   * Register a new tunnel route
   * @param {string} hostname - The hostname to route (e.g. app.dev.local)
   * @param {string} target - The target to proxy to (e.g. 127.0.0.1:8000)
   */
  registerTunnel(hostname, target) {
    this.routes.set(hostname, target);
    console.log(`Registered route: ${hostname} -> ${target}`);
  }

  /**
   * Unregister a tunnel route
   * @param {string} hostname - The hostname to unregister
   * @returns {boolean} - Whether the route was found and removed
   */
  unregisterTunnel(hostname) {
    const result = this.routes.delete(hostname);
    if (result) {
      console.log(`Unregistered route: ${hostname}`);
    }
    return result;
  }

  /**
   * Get all registered routes
   * @returns {Object} - Map of hostname -> target
   */
  getRoutes() {
    return Object.fromEntries(this.routes);
  }

  /**
   * Stop the proxy server
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Proxy server stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = ProxyServer;