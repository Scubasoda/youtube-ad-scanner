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

// Debug mode - set to false to reduce console spam
const DEBUG = true;

function observeWhenReady() {
  if (document.body) {
    console.log('[SCAM-SCANNER] Document body ready, starting scanner');
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
  let totalFound = 0;
  AD_CONTAINERS.forEach(selector => {
    try {
      const containers = document.querySelectorAll(selector);
      if (DEBUG && containers.length > 0) {
        console.log(`[SCAM-SCANNER] Found ${containers.length} containers matching: ${selector}`);
      }
      totalFound += containers.length;
      containers.forEach(scanContainer);
    } catch (e) {
      if (DEBUG) console.log(`[SCAM-SCANNER] Error with selector ${selector}:`, e);
    }
  });
  if (DEBUG && totalFound === 0) {
    console.log('[SCAM-SCANNER] No ad containers found in this scan');
  }
}

function scanContainer(container) {
  // Check if recently scanned (within 2 seconds)
  const lastScan = scannedContainers.get(container);
  const now = Date.now();
  if (lastScan && (now - lastScan) < 2000) return;
  
  scannedContainers.set(container, now);
  
  if (DEBUG) {
    console.log('[SCAM-SCANNER] Scanning container:', container.tagName, container.className);
  }
  
  let foundAd = false;
  
  // Scan aria-label (your example)
  const ariaLabel = container.getAttribute('aria-label');
  if (DEBUG && ariaLabel) {
    console.log('[SCAM-SCANNER] Found aria-label:', ariaLabel);
  }
  if (ariaLabel && isValidAdDomain(ariaLabel)) {
    if (DEBUG) console.log('[SCAM-SCANNER] Valid domain in aria-label:', ariaLabel);
    logAd({
      url: `https://${ariaLabel}`,
      type: 'display-ad',
      source: 'aria-label'
    });
    foundAd = true;
  } else if (ariaLabel && DEBUG) {
    console.log('[SCAM-SCANNER] aria-label rejected:', ariaLabel, 'Reason: invalid domain');
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
  const textNodes = [];
  while (node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && text.length > 5 && text.length < 100) {
      textNodes.push(text);
      // Must contain a dot and valid TLD
      if (isValidAdDomain(text)) {
        if (DEBUG) console.log('[SCAM-SCANNER] Valid domain in text:', text);
        logAd({
          url: `https://${text}`,
          type: 'display-ad',
          source: 'text-node'
        });
        foundAd = true;
      }
    }
  }
  if (DEBUG && textNodes.length > 0 && !foundAd) {
    console.log('[SCAM-SCANNER] Text nodes found but none valid:', textNodes.slice(0, 5));
  }
  
  // Scan links within container
  const links = container.querySelectorAll && container.querySelectorAll('a[href]');
  if (DEBUG && links && links.length > 0) {
    console.log(`[SCAM-SCANNER] Found ${links.length} links in container`);
  }
  links && links.forEach(link => {
    if (DEBUG) console.log('[SCAM-SCANNER] Link href:', link.href);
    if (link.href && !link.href.includes('youtube.com')) {
      if (DEBUG) console.log('[SCAM-SCANNER] Valid external link:', link.href);
      logAd({
        url: link.href,
        type: 'sponsored-link',
        source: 'link-href'
      });
      foundAd = true;
    }
  });
  
  if (DEBUG && !foundAd) {
    console.log('[SCAM-SCANNER] No ads found in this container');
  }
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
  console.log('[SCAM-SCANNER] ✓ AD DETECTED:', adInfo);
  chrome.runtime.sendMessage({
    action: 'logAdElement',
    adInfo: adInfo,
    timestamp: Date.now()
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[SCAM-SCANNER] Error sending message:', chrome.runtime.lastError);
    }
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

// Debug helper - run in console: window.debugAdScanner()
window.debugAdScanner = function() {
  console.log('=== AD SCANNER DEBUG INFO ===');
  console.log('Ad containers found on page:');
  AD_CONTAINERS.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`  ${selector}: ${elements.length} found`);
        elements.forEach((el, i) => {
          console.log(`    [${i}]`, el);
          console.log(`      - aria-label: ${el.getAttribute('aria-label')}`);
          console.log(`      - data-url: ${el.getAttribute('data-url')}`);
          console.log(`      - text content: ${el.textContent?.substring(0, 100)}`);
          const links = el.querySelectorAll('a[href]');
          if (links.length > 0) {
            console.log(`      - links found: ${links.length}`);
            links.forEach(link => console.log(`        • ${link.href}`));
          }
        });
      }
    } catch (e) {}
  });
  console.log('\nAll elements with "ad" in class or id:');
  const adElements = document.querySelectorAll('[class*="ad"], [id*="ad"]');
  console.log(`  Found ${adElements.length} elements`);
  Array.from(adElements).slice(0, 10).forEach(el => {
    console.log(`  - ${el.tagName}.${el.className} #${el.id}`);
  });
  console.log('=========================');
};
