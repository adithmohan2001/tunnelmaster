export function renderHosts(hosts) {
    const container = document.getElementById('hosts-section');
    container.innerHTML = `<h2>Hosts</h2>`;
    if (hosts.length === 0) {
      container.innerHTML += `<p>No hosts configured.</p>`;
    } else {
      hosts.forEach(host => {
        container.innerHTML += `
          <div>
            <strong>${host.name}</strong> (${host.hostname}:${host.port})<br />
            Group ID: ${host.groupId}<br />
            Username: ${host.username}
          </div>`;
      });
    }
  }
  