let adLog = [];
chrome.storage.local.get(['adLog'], r => adLog = r.adLog || []);

// Auto-save logs every 5 minutes
setInterval(() => {
  if (adLog.length > 0) {
    autoExportLogs();
  }
}, 5 * 60 * 1000); // 5 minutes

function cleanUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Filter out Google ad service domains - extract destination URL if possible
    if (urlObj.hostname.includes('googleadservices.com') || 
        urlObj.hostname.includes('doubleclick.net') ||
        urlObj.hostname.includes('googlesyndication.com')) {
      
      // Try to extract actual destination from query params
      const destUrl = urlObj.searchParams.get('adurl') || 
                      urlObj.searchParams.get('url') ||
                      urlObj.searchParams.get('q');
      
      if (destUrl) {
        return cleanUrl(destUrl); // Recursively clean the extracted URL
      }
      
      // If no destination found, return null to skip this URL
      return null;
    }
    
    // Remove tracking parameters
    const cleanParams = new URLSearchParams();
    for (const [key, value] of urlObj.searchParams) {
      // Keep only essential params, skip tracking
      if (!key.match(/^(utm_|fbclid|gclid|_ga|mc_)/i)) {
        cleanParams.set(key, value);
      }
    }
    
    urlObj.search = cleanParams.toString();
    return urlObj.toString();
  } catch (e) {
    return url.startsWith('http') ? url : `https://${url}`;
  }
}

function autoExportLogs() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `youtube-ads-auto-${timestamp}.json`;
  
  chrome.downloads.download({
    url: URL.createObjectURL(new Blob([JSON.stringify(adLog, null, 2)], {type: 'application/json'})),
    filename: filename,
    saveAs: false // Auto-save without prompt
  });
  
  console.log(`[SCAM-SCANNER] Auto-saved ${adLog.length} ads to ${filename}`);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'logAdElement') {
    const adInfo = request.adInfo;
    
    // Clean the URL
    const cleanedUrl = cleanUrl(adInfo.url);
    
    // Skip if URL was filtered out or is duplicate
    if (!cleanedUrl || adLog.some(entry => entry.destinationUrl === cleanedUrl)) {
      return;
    }
    
    const logEntry = {
      timestamp: request.timestamp,
      destinationUrl: cleanedUrl,
      adType: adInfo.type,
      source: adInfo.source,
      videoId: sender.tab?.url ? new URL(sender.tab.url).searchParams.get('v') || 'unknown' : 'unknown'
    };
    
    adLog.unshift(logEntry);
    if (adLog.length > 500) adLog = adLog.slice(0, 500);
    
    chrome.storage.local.set({ adLog });
    console.log(`[SCAM-SCANNER] Ad: ${cleanedUrl} (${adInfo.source})`);
  }
  
  if (request.action === 'getAdLog') sendResponse({ adLog });
  if (request.action === 'clearAdLog') {
    adLog = [];
    chrome.storage.local.set({ adLog: [] });
    sendResponse({ success: true });
  }
});
