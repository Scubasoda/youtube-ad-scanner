let adLog = [];
chrome.storage.local.get(['adLog'], r => adLog = r.adLog || []);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'logAdElement') {
    const adInfo = request.adInfo;
    
    // Clean the URL
    const cleanUrl = adInfo.url.startsWith('http') ? adInfo.url : `https://${adInfo.url}`;
    
    // Skip duplicates
    if (adLog.some(entry => entry.destinationUrl === cleanUrl)) {
      return;
    }
    
    const logEntry = {
      timestamp: request.timestamp,
      destinationUrl: cleanUrl,
      adType: adInfo.type,
      source: adInfo.source,
      videoId: sender.tab?.url ? new URL(sender.tab.url).searchParams.get('v') || 'unknown' : 'unknown'
    };
    
    adLog.unshift(logEntry);
    if (adLog.length > 500) adLog = adLog.slice(0, 500);
    
    chrome.storage.local.set({ adLog });
    console.log(`[SCAM-SCANNER] Ad: ${cleanUrl} (${adInfo.source})`);
  }
  
  if (request.action === 'getAdLog') sendResponse({ adLog });
  if (request.action === 'clearAdLog') {
    adLog = [];
    chrome.storage.local.set({ adLog: [] });
    sendResponse({ success: true });
  }
});
