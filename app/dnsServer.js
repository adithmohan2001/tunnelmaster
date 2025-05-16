const dns2 = require('dns2');
const { Packet } = dns2;

class DNSServer {
  constructor(port = 5353, domainSuffix = 'dev.local') {
    this.port = port;
    this.domainSuffix = domainSuffix;
    this.server = null;
  }

  /**
   * Start the DNS server
   * @returns {Promise<void>}
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        // Create DNS server
        this.server = dns2.createServer({
          udp: true,
          handle: (request, send, rinfo) => {
            const response = Packet.createResponseFromRequest(request);
            const [question] = request.questions;
            const { name } = question;

            console.log(`DNS query: ${name}`);

            // Check if domain ends with our suffix
            if (name.endsWith(this.domainSuffix)) {
              // Resolve to localhost
              response.answers.push({
                name,
                type: Packet.TYPE.A,
                class: Packet.CLASS.IN,
                ttl: 300,
                address: '127.0.0.1'
              });

              console.log(`Resolved ${name} to 127.0.0.1`);
            } else {
              // Forward to system DNS for other domains
              this.forwardDNSQuery(question)
                .then(results => {
                  // Add results to response
                  results.forEach(result => {
                    response.answers.push(result);
                  });
                  send(response);
                })
                .catch(err => {
                  console.error(`DNS forwarding error for ${name}:`, err);
                  send(response); // Send empty response on error
                });
              return; // Don't send response yet
            }

            send(response);
          }
        });

        // Start listening
        this.server.listen({ udp: { port: this.port, address: '127.0.0.1' } });

        console.log(`DNS server started on 127.0.0.1:${this.port}`);
        resolve();
      } catch (err) {
        console.error('Failed to start DNS server:', err);
        reject(err);
      }
    });
  }

  /**
   * Forward DNS query to system DNS
   * @param {object} question - DNS question
   * @returns {Promise<Array>} - Array of answer objects
   */
  async forwardDNSQuery(question) {
    const { name, type } = question;
    
    // Get system DNS servers
    const dns = require('dns');
    const systemServers = dns.getServers().filter(server => 
      server !== '127.0.0.1' && !server.includes(':5353')
    );
    
    if (systemServers.length === 0) {
      // Use public DNS if no system DNS available
      systemServers.push('8.8.8.8');
    }
    
    try {
      // Create a resolver using the first system DNS
      const server = systemServers[0];
      const resolver = new dns2.Resolver({
        nameServers: [server]
      });
      
      // Forward the query
      const result = await resolver.resolve(name, type);
      return result.answers || [];
    } catch (err) {
      console.error(`Error forwarding DNS query for ${name}:`, err);
      return [];
    }
  }

  /**
   * Stop the DNS server
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('DNS server stopped');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = DNSServer;