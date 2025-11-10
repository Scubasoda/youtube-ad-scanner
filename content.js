console.log('[SCAM-SCANNER] Focused ad scanner active');

// Only scan these SPECIFIC ad containers
const AD_CONTAINERS = [
  'ytd-promoted-sparkles-web-renderer',  // Display ads
  'ytd-ad-slot-renderer',                // Banner ads
  '.video-ads',                          // Video ads
  '.ytp-ad-module',                      // Ad player module
  '.ytp-ad-player-overlay',              // Overlay ads
  '.ytp-ad-avatar-lockup-card',          // Your example's container
  'ytd-player-ads-overlay',              // Mid-roll ads
  'ad-slot-renderer'                     // Generic ad slot
];

// Words to EXCLUDE (common UI elements)
const EXCLUDE_WORDS = ['play', 'plays', 'like', 'likes', 'share', 'save', 'subscribe', 'channel', 'youtube', 'google'];

// Valid TLDs for validation
const VALID_TLDS = ['.com', '.net', '.org', '.io', '.co', '.au', '.uk', '.ca', '.de', '.fr', '.it', '.es', '.nl', '.be', '.ch', '.at', '.nz', '.jp', '.in'];

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
  
  // Watch for new ad containers
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          // Check if the added node ITSELF is an ad container
          if (isAdContainer(node)) {
            scanContainer(node);
          }
          // Or if it contains ad containers
          AD_CONTAINERS.forEach(selector => {
            try {
              node.querySelectorAll && node.querySelectorAll(selector).forEach(scanContainer);
            } catch (e) {}
          });
        }
      });
    });
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
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
  if (container.dataset.scanned) return;
  container.dataset.scanned = 'true';
  
  // Scan aria-label (your example)
  const ariaLabel = container.getAttribute('aria-label');
  if (ariaLabel && isValidAdDomain(ariaLabel)) {
    logAd({
      url: `https://${ariaLabel}`,
      type: 'display-ad',
      source: 'aria-label'
    });
    return; // Skip text scan if aria-label found
  }
  
  // Scan text nodes within container ONLY
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

// Network scanning (still active but less noisy)
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const url = args[0];
  if (typeof url === 'string' && isAdNetworkUrl(url)) {
    logAd({
      url: url,
      type: 'network-ad',
      source: 'fetch'
    });
  }
  return originalFetch.apply(this, args);
};

function isAdNetworkUrl(url) {
  const adNetworks = ['doubleclick.net', 'googleadservices.com', 'googlesyndication.com', 'youtube.com/pagead'];
  return adNetworks.some(network => url.includes(network));
}

observeWhenReady();
