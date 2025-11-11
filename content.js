console.log('[SCAM-SCANNER] Focused ad scanner active');

// Only scan these SPECIFIC ad containers - expanded list
const AD_CONTAINERS = [
  'ytd-promoted-sparkles-web-renderer',  // Display ads
  'ytd-ad-slot-renderer',                // Banner ads
  '.video-ads',                          // Video ads
  '.ytp-ad-module',                      // Ad player module
  '.ytp-ad-player-overlay',              // Overlay ads
  '.ytp-ad-avatar-lockup-card',          // Your example's container
  'ytd-player-ads-overlay',              // Mid-roll ads
  'ad-slot-renderer',                    // Generic ad slot
  'ytd-display-ad-renderer',             // Display ad renderer
  'ytd-promoted-video-renderer',         // Promoted videos
  'ytd-banner-promo-renderer',           // Banner promos
  '[id*="ad-"]',                         // Elements with 'ad-' in ID
  '[class*="-ad-"]',                     // Elements with '-ad-' in class
  '[class*="ad-container"]',             // Ad container classes
  'ytd-in-feed-ad-layout-renderer'       // In-feed ads
];

// Words to EXCLUDE (common UI elements)
const EXCLUDE_WORDS = ['play', 'plays', 'like', 'likes', 'share', 'save', 'subscribe', 'channel', 'youtube', 'google'];

// Valid TLDs for validation
const VALID_TLDS = ['.com', '.net', '.org', '.io', '.co', '.au', '.uk', '.ca', '.de', '.fr', '.it', '.es', '.nl', '.be', '.ch', '.at', '.nz', '.jp', '.in'];

// Track scanned containers with timestamp to allow rescanning
const scannedContainers = new WeakMap();

function observeWhenReady() {
  if (document.body) {
    startFocusedScanning();
  } else {
    setTimeout(observeWhenReady, 100);
  }
}

function startFocusedScanning() {
  console.log('[SCAM-SCANNER] Scanning only ad containers...');
  
  // Scan ad containers immediately
  scanAdContainers();
  
  // Periodic full rescan every 5 seconds to catch missed ads
  setInterval(() => {
    scanAdContainers();
  }, 5000);
  
  // Watch for new ad containers
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          // Check if the added node ITSELF is an ad container
          if (isAdContainer(node)) {
            // Delay scan slightly to ensure content is loaded
            setTimeout(() => scanContainer(node), 100);
          }
          // Or if it contains ad containers
          AD_CONTAINERS.forEach(selector => {
            try {
              if (node.querySelectorAll) {
                node.querySelectorAll(selector).forEach(container => {
                  setTimeout(() => scanContainer(container), 100);
                });
              }
            } catch (e) {}
          });
        }
      });
      
      // Also check for attribute changes that might indicate new ad content
      if (mutation.type === 'attributes' && mutation.target.nodeType === 1) {
        if (isAdContainer(mutation.target)) {
          setTimeout(() => scanContainer(mutation.target), 100);
        }
      }
    });
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'href', 'data-url']
  });
}

// Check if element is an ad container
function isAdContainer(element) {
  return AD_CONTAINERS.some(selector => {
    try {
      return element.matches && element.matches(selector);
    } catch (e) {
      return false;
    }
  });
}

// Scan only within ad containers
function scanAdContainers() {
  AD_CONTAINERS.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(scanContainer);
    } catch (e) {}
  });
}

function scanContainer(container) {
  // Check if recently scanned (within 2 seconds)
  const lastScan = scannedContainers.get(container);
  const now = Date.now();
  if (lastScan && (now - lastScan) < 2000) return;
  
  scannedContainers.set(container, now);
  
  let foundAd = false;
  
  // Scan aria-label (your example)
  const ariaLabel = container.getAttribute('aria-label');
  if (ariaLabel && isValidAdDomain(ariaLabel)) {
    logAd({
      url: `https://${ariaLabel}`,
      type: 'display-ad',
      source: 'aria-label'
    });
    foundAd = true;
  }
  
  // Check for data-url attributes
  const dataUrl = container.getAttribute('data-url') || container.getAttribute('data-ad-url');
  if (dataUrl && !dataUrl.includes('youtube.com')) {
    logAd({
      url: dataUrl,
      type: 'display-ad',
      source: 'data-attribute'
    });
    foundAd = true;
  }
  
  // Scan text nodes within container ONLY (even if aria-label found, to catch all ads)
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && text.length > 5 && text.length < 100) {
      // Must contain a dot and valid TLD
      if (isValidAdDomain(text)) {
        logAd({
          url: `https://${text}`,
          type: 'display-ad',
          source: 'text-node'
        });
      }
    }
  }
  
  // Scan links within container
  container.querySelectorAll && container.querySelectorAll('a[href]').forEach(link => {
    if (link.href && !link.href.includes('youtube.com')) {
      logAd({
        url: link.href,
        type: 'sponsored-link',
        source: 'link-href'
      });
    }
  });
}

// Strict domain validation
function isValidAdDomain(text) {
  // Must contain a dot
  if (!text.includes('.')) return false;
  
  // Must end with valid TLD (not just any string with dot)
  if (!VALID_TLDS.some(tld => text.toLowerCase().endsWith(tld))) return false;
  
  // Exclude common UI words
  if (EXCLUDE_WORDS.some(word => text.toLowerCase().includes(word))) return false;
  
  // Must look like a domain (letters/numbers/hyphens only)
  if (!/^[a-zA-Z0-9.-]+$/.test(text)) return false;
  
  // Exclude YouTube/Google domains
  if (text.includes('youtube.com') || text.includes('google.com')) return false;
  
  return true;
}

// Send to background
function logAd(adInfo) {
  chrome.runtime.sendMessage({
    action: 'logAdElement',
    adInfo: adInfo,
    timestamp: Date.now()
  });
}

// Network scanning - extract destination URLs from ad networks
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0];
  if (typeof url === 'string') {
    try {
      const urlObj = new URL(url);
      
      // Check for ad networks
      if (urlObj.hostname.includes('doubleclick.net') || 
          urlObj.hostname.includes('googleadservices.com') ||
          urlObj.hostname.includes('googlesyndication.com') ||
          url.includes('youtube.com/pagead')) {
        
        // Extract destination URL from parameters
        const destUrl = urlObj.searchParams.get('adurl') || 
                       urlObj.searchParams.get('url') ||
                       urlObj.searchParams.get('q');
        
        if (destUrl) {
          logAd({
            url: destUrl,
            type: 'network-ad',
            source: 'fetch-extracted'
          });
        }
      }
    } catch (e) {}
  }
  return originalFetch.apply(this, args);
};

// Also intercept XMLHttpRequest
const originalXHROpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  if (typeof url === 'string') {
    try {
      const urlObj = new URL(url, window.location.href);
      
      // Check for ad networks
      if (urlObj.hostname.includes('doubleclick.net') || 
          urlObj.hostname.includes('googleadservices.com') ||
          urlObj.hostname.includes('googlesyndication.com') ||
          url.includes('youtube.com/pagead')) {
        
        // Extract destination URL from parameters
        const destUrl = urlObj.searchParams.get('adurl') || 
                       urlObj.searchParams.get('url') ||
                       urlObj.searchParams.get('q');
        
        if (destUrl) {
          logAd({
            url: destUrl,
            type: 'network-ad',
            source: 'xhr-extracted'
          });
        }
      }
    } catch (e) {}
  }
  return originalXHROpen.apply(this, [method, url, ...rest]);
};

observeWhenReady();
