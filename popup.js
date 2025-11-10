document.addEventListener('DOMContentLoaded', async () => {
  await loadAdLog();
  document.getElementById('clearBtn').addEventListener('click', clearLogs);
  document.getElementById('exportBtn').addEventListener('click', exportReport);
  setInterval(loadAdLog, 3000);
});

async function loadAdLog() {
  const result = await chrome.storage.local.get(['adLog']);
  const adLog = result.adLog || [];
  
  document.getElementById('totalAds').textContent = adLog.length;
  
  const listEl = document.getElementById('adList');
  const noAdsEl = document.getElementById('no-ads');
  
  if (adLog.length === 0) {
    listEl.innerHTML = '';
    noAdsEl.style.display = 'block';
    return;
  }
  
  noAdsEl.style.display = 'none';
  
  listEl.innerHTML = adLog.slice(0, 30).map(ad => `
    <div class="ad-item">
      <div class="destination-url" title="Click to copy" data-url="${ad.destinationUrl}">
        ${ad.destinationUrl}
      </div>
      <div class="meta">
        ${ad.adType} • ${new Date(ad.timestamp).toLocaleTimeString()}
      </div>
    </div>
  `).join('');
  
  document.querySelectorAll('.destination-url').forEach(el => {
    el.addEventListener('click', () => {
      navigator.clipboard.writeText(el.dataset.url);
      el.textContent = '✓ Copied!';
      setTimeout(() => { el.textContent = el.dataset.url; }, 1000);
    });
  });
}

async function clearLogs() {
  if (confirm('Clear all logs?')) {
    await chrome.runtime.sendMessage({ action: 'clearAdLog' });
    await loadAdLog();
  }
}

function exportReport() {
  chrome.storage.local.get(['adLog'], r => {
    const blob = new Blob([JSON.stringify(r.adLog || [], null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `youtube-ads-${Date.now()}.json`;
    a.click();
  });
}
