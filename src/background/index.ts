/**
 * Background Service Worker
 * Handles ad logging and storage management
 */

import { AdLogEntry, AdInfo, TelemetryData } from '../types';

// Ad log storage
let adLog: AdLogEntry[] = [];

// Load existing logs on startup
chrome.storage.local.get(['adLog'], (result) => {
  adLog = result.adLog || [];
  console.log(`[SCAM-SCANNER] Loaded ${adLog.length} existing ad logs`);
});

// Auto-save logs every 5 minutes
setInterval(() => {
  if (adLog.length > 0) {
    autoExportLogs();
  }
}, 5 * 60 * 1000);

/**
 * Clean and normalize a URL
 */
function cleanUrl(url: string): string | null {
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
    const trackingParams = /^(utm_|fbclid|gclid|_ga|mc_)/i;
    const cleanParams = new URLSearchParams();
    
    for (const [key, value] of urlObj.searchParams) {
      if (!trackingParams.test(key)) {
        cleanParams.set(key, value);
      }
    }
    
    urlObj.search = cleanParams.toString();
    return urlObj.toString();
  } catch {
    // Try to make a valid URL
    if (url.startsWith('http')) {
      return url;
    }
    return `https://${url}`;
  }
}

/**
 * Auto-export logs to file
 */
function autoExportLogs(): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `youtube-ads-auto-${timestamp}.json`;
  
  try {
    const blob = new Blob([JSON.stringify(adLog, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url,
      filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[SCAM-SCANNER] Auto-export failed:', chrome.runtime.lastError.message);
      } else {
        console.log(`[SCAM-SCANNER] Auto-saved ${adLog.length} ads to ${filename} (download ID: ${downloadId})`);
      }
      // Clean up blob URL
      URL.revokeObjectURL(url);
    });
  } catch (error) {
    console.error('[SCAM-SCANNER] Auto-export error:', error);
  }
}

/**
 * Get video ID from tab URL
 */
function getVideoIdFromUrl(url: string | undefined): string {
  if (!url) return 'unknown';
  
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v') || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Handle incoming messages from content scripts
 */
chrome.runtime.onMessage.addListener((
  request: { action: string; adInfo?: AdInfo; timestamp?: number },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: { adLog?: AdLogEntry[]; success?: boolean }) => void
) => {
  if (request.action === 'logAdElement' && request.adInfo) {
    const adInfo = request.adInfo;
    
    // Clean the URL
    const cleanedUrl = cleanUrl(adInfo.url);
    
    // Skip if URL was filtered out or is duplicate
    if (!cleanedUrl || adLog.some(entry => entry.destinationUrl === cleanedUrl)) {
      sendResponse({ success: false });
      return true;
    }
    
    const logEntry: AdLogEntry = {
      timestamp: request.timestamp || Date.now(),
      destinationUrl: cleanedUrl,
      adType: adInfo.type,
      source: adInfo.source,
      confidence: adInfo.confidence,
      evidence: adInfo.evidence,
      videoId: getVideoIdFromUrl(sender.tab?.url)
    };
    
    // Add to log (newest first)
    adLog.unshift(logEntry);
    
    // Limit log size
    if (adLog.length > 500) {
      adLog = adLog.slice(0, 500);
    }
    
    // Save to storage
    chrome.storage.local.set({ adLog });
    
    console.log(`[SCAM-SCANNER] Ad logged: ${cleanedUrl} (${adInfo.source}, confidence: ${adInfo.confidence?.toFixed(2) || 'N/A'})`);
    
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getAdLog') {
    sendResponse({ adLog });
    return true;
  }
  
  if (request.action === 'clearAdLog') {
    adLog = [];
    chrome.storage.local.set({ adLog: [] });
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'exportLogs') {
    autoExportLogs();
    sendResponse({ success: true });
    return true;
  }

  // Return true to indicate async response
  return true;
});

/**
 * Store telemetry data (privacy-preserving, local only)
 */
function storeTelemetry(data: TelemetryData): void {
  chrome.storage.local.get(['telemetry'], (result) => {
    const telemetry: TelemetryData[] = result.telemetry || [];
    telemetry.push(data);
    
    // Keep only last 100 entries
    if (telemetry.length > 100) {
      telemetry.splice(0, telemetry.length - 100);
    }
    
    chrome.storage.local.set({ telemetry });
  });
}

// Export for potential use
console.log('[SCAM-SCANNER] Background service worker initialized');

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[SCAM-SCANNER] Extension ${details.reason}: ${details.previousVersion || 'first install'}`);
  
  if (details.reason === 'install') {
    // Initialize default settings
    chrome.storage.local.set({
      adLog: [],
      telemetry: [],
      settings: {
        autoExport: true,
        exportInterval: 5,
        debugMode: false
      }
    });
  }
});

// Keep service worker alive with periodic heartbeat
setInterval(() => {
  console.log(`[SCAM-SCANNER] Heartbeat - ${adLog.length} ads logged`);
}, 60000);

// Expose for testing
export { cleanUrl, getVideoIdFromUrl, storeTelemetry };
