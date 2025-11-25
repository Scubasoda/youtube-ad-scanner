/**
 * Popup UI Script
 * Handles the extension popup interface
 */

import { AdLogEntry } from '../types';

/**
 * Load and display ad log
 */
async function loadAdLog(): Promise<void> {
  const result = await chrome.storage.local.get(['adLog']);
  const adLog: AdLogEntry[] = result.adLog || [];
  
  // Update total count
  const totalEl = document.getElementById('totalAds');
  if (totalEl) {
    totalEl.textContent = adLog.length.toString();
  }
  
  const listEl = document.getElementById('adList');
  const noAdsEl = document.getElementById('no-ads');
  
  if (!listEl || !noAdsEl) return;
  
  if (adLog.length === 0) {
    listEl.innerHTML = '';
    noAdsEl.style.display = 'block';
    return;
  }
  
  noAdsEl.style.display = 'none';
  
  // Display ads (max 30)
  listEl.innerHTML = adLog.slice(0, 30).map(ad => {
    const confidence = ad.confidence !== undefined 
      ? `${Math.round(ad.confidence * 100)}%` 
      : 'N/A';
    
    return `
      <div class="ad-item">
        <div class="destination-url" title="Click to copy" data-url="${escapeHtml(ad.destinationUrl)}">
          ${escapeHtml(ad.destinationUrl)}
        </div>
        <div class="meta">
          ${escapeHtml(ad.adType)} • ${new Date(ad.timestamp).toLocaleTimeString()} • Confidence: ${confidence}
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers for copying URLs
  document.querySelectorAll('.destination-url').forEach(el => {
    el.addEventListener('click', async () => {
      const url = el.getAttribute('data-url');
      if (url) {
        await navigator.clipboard.writeText(url);
        el.textContent = '✓ Copied!';
        setTimeout(() => {
          el.textContent = url;
        }, 1000);
      }
    });
  });
}

/**
 * Clear all logs
 */
async function clearLogs(): Promise<void> {
  if (confirm('Clear all logs?')) {
    await chrome.runtime.sendMessage({ action: 'clearAdLog' });
    await loadAdLog();
  }
}

/**
 * Export logs to file
 */
function exportReport(): void {
  chrome.storage.local.get(['adLog'], (result) => {
    const adLog = result.adLog || [];
    const blob = new Blob([JSON.stringify(adLog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-ads-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/**
 * Export as CSV
 */
function exportCSV(): void {
  chrome.storage.local.get(['adLog'], (result) => {
    const adLog: AdLogEntry[] = result.adLog || [];
    
    // CSV headers
    const headers = ['Timestamp', 'URL', 'Type', 'Source', 'Confidence', 'Video ID'];
    
    // CSV rows
    const rows = adLog.map(ad => [
      new Date(ad.timestamp).toISOString(),
      `"${ad.destinationUrl}"`,
      ad.adType,
      ad.source,
      ad.confidence !== undefined ? ad.confidence.toFixed(2) : '',
      ad.videoId
    ].join(','));
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `youtube-ads-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize popup
 */
document.addEventListener('DOMContentLoaded', async () => {
  await loadAdLog();
  
  // Setup event listeners
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearLogs);
  }
  
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportReport);
  }
  
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportCSV);
  }
  
  // Auto-refresh every 3 seconds
  setInterval(loadAdLog, 3000);
});
