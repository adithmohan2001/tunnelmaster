export function renderSettings(settings) {
    const container = document.getElementById('settings-section');
    container.innerHTML = `<h2>Settings</h2>
      <div>DNS Port: ${settings.dnsPort}</div>
      <div>Proxy Port: ${settings.proxyPort}</div>
      <div>Domain Suffix: ${settings.domainSuffix}</div>
      <div>Start Minimized: ${settings.startMinimized ? 'Yes' : 'No'}</div>
      <div>Auto Start Tunnels: ${settings.autoStartTunnels ? 'Yes' : 'No'}</div>`;
  }
  