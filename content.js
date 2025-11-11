console.log('[SCAM-SCANNER] Focused ad scanner active');

// Expanded ad container selectors - be more aggressive
const AD_CONTAINERS = [
  // Video player ads
  '.video-ads',
  '.ytp-ad-module',
  '.ytp-ad-player-overlay',
  '.ytp-ad-overlay-container',
  '.ytp-ad-text',
  '.ytp-ad-image-overlay',
  'ytd-player-legacy-desktop-watch-ads-renderer',
  
  // Display/banner ads
  'ytd-promoted-sparkles-web-renderer',
  'ytd-ad-slot-renderer',
  'ytd-display-ad-renderer',
  'ytd-banner-promo-renderer',
  'ytd-statement-banner-renderer',
  
  // Promoted content
  'ytd-promoted-video-renderer',
  'ytd-compact-promoted-video-renderer',
  '.ytd-promoted-video-renderer',
  
  // In-feed ads
  'ytd-in-feed-ad-layout-renderer',
  'ytd-ad-inline-playback-renderer',
  
  // Overlay and cards
  '.ytp-ad-avatar-lockup-card',
  'ytd-player-ads-overlay',
  
  // Generic patterns
  '[id*="ad-"]',
  '[id*="ads-"]',
  '[class*="-ad-"]',
  '[class*="ad-container"]',
  '[class*="ad_container"]',
  'ad-slot-renderer',
  
  // Catch-all for any element with ad-related attributes
  '[data-ad-id]',
  '[data-ad-slot]',
  '[data-google-query-id]'
];

// Words to EXCLUDE (common UI elements)
const EXCLUDE_WORDS = ['play', 'plays', 'like', 'likes', 'share', 'save', 'subscribe', 'channel', 'youtube', 'google', 'video', 'watch'];

// Domains to EXCLUDE (Google/YouTube infrastructure)
const EXCLUDE_DOMAINS = [
  'youtube.com',
  'ytimg.com',
  'ggpht.com',
  'googleusercontent.com',
  'googlevideo.com',
  'gstatic.com',
  'google.com',
  'googleapis.com',
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com'
];

// Valid TLDs for validation - expanded list
const VALID_TLDS = [
  '.com', '.net', '.org', '.io', '.co', '.au', '.uk', '.ca', '.de', '.fr', 
  '.it', '.es', '.nl', '.be', '.ch', '.at', '.nz', '.jp', '.in', '.us',
  '.ai', '.app', '.dev', '.tech', '.online', '.store', '.shop', '.site',
  '.xyz', '.me', '.tv', '.cc', '.info', '.biz', '.pro', '.ly'
];

// Track scanned containers with timestamp to allow rescanning
const scannedContainers = new WeakMap();
const loggedUrls = new Set(); // Prevent duplicate logs in same session

// Debug mode - set to false to reduce console spam
const DEBUG = true;

// Check if URL should be excluded
function shouldExcludeUrl(url) {
  if (!url) return true;
  
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Exclude if matches any excluded domain
    if (EXCLUDE_DOMAINS.some(domain => hostname.includes(domain))) {
      if (DEBUG) console.log('[SCAM-SCANNER] URL excluded (Google/YouTube):', hostname);
      return true;
    }
    
    return false;
  } catch (e) {
    return true; // Invalid URL
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
  
  // Exclude Google/YouTube domains
  if (EXCLUDE_DOMAINS.some(domain => text.toLowerCase().includes(domain))) return false;
  
  // Must look like a domain (letters/numbers/hyphens only)
  if (!/^[a-zA-Z0-9.-]+$/.test(text)) return false;
  
  return true;
}

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
  
  // More frequent rescanning - every 2 seconds
  setInterval(() => {
    scanAdContainers();
  }, 2000);
  
  // Also scan for video ad overlays more aggressively
  setInterval(() => {
    scanVideoPlayer();
  }, 1000);
  
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
    attributeFilter: ['aria-label', 'href', 'data-url', 'data-ad-id', 'src']
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

// Special video player ad scanner
function scanVideoPlayer() {
  const player = document.querySelector('.html5-video-player');
  if (!player) return;
  
  // Check if ad is playing
  const adIndicators = [
    player.classList.contains('ad-showing'),
    player.classList.contains('ad-interrupting'),
    player.querySelector('.ytp-ad-text'),
    player.querySelector('.ytp-ad-skip-button'),
    player.querySelector('.ytp-ad-preview-container'),
    document.querySelector('.ytp-ad-player-overlay-layout')
  ];
  
  const isAdPlaying = adIndicators.some(indicator => indicator);
  
  if (isAdPlaying) {
    if (DEBUG) console.log('[SCAM-SCANNER] Video ad detected in player');
    
    // Try to extract ad URL from various sources
    const adTextElements = player.querySelectorAll('.ytp-ad-text, .ytp-ad-visit-advertiser-button');
    adTextElements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && isValidAdDomain(text)) {
        logAd({
          url: `https://${text}`,
          type: 'video-ad',
          source: 'video-player-text'
        });
      }
    });
    
    // Check for click-through links
    const adLinks = player.querySelectorAll('a[href*="adurl"], a[href*="googleadservices"]');
    adLinks.forEach(link => {
      if (link.href && !shouldExcludeUrl(link.href)) {
        logAd({
          url: link.href,
          type: 'video-ad',
          source: 'video-player-link'
        });
      }
    });
  }
}

function scanContainer(container) {
  // Check if recently scanned (within 1 second - reduced from 2)
  const lastScan = scannedContainers.get(container);
  const now = Date.now();
  if (lastScan && (now - lastScan) < 1000) return;
  
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
  if (dataUrl && !shouldExcludeUrl(dataUrl)) {
    logAd({
      url: dataUrl,
      type: 'display-ad',
      source: 'data-attribute'
    });
    foundAd = true;
  }
  
  // Check all image sources (ads often have branded images)
  const images = container.querySelectorAll('img[src]');
  images.forEach(img => {
    const src = img.src;
    if (src && !shouldExcludeUrl(src)) {
      if (DEBUG) console.log('[SCAM-SCANNER] External image found:', src);
      logAd({
        url: src,
        type: 'display-ad-image',
        source: 'image-src'
      });
      foundAd = true;
    }
  });
  
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
    if (link.href && !shouldExcludeUrl(link.href)) {
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

// Send to background
function logAd(adInfo) {
  // Prevent duplicate logging in same session
  const urlKey = adInfo.url + adInfo.source;
  if (loggedUrls.has(urlKey)) {
    if (DEBUG) console.log('[SCAM-SCANNER] Duplicate ad skipped:', adInfo.url);
    return;
  }
  loggedUrls.add(urlKey);
  
  console.log('[SCAM-SCANNER] ✓ AD DETECTED:', adInfo);
  chrome.runtime.sendMessage({
    action: 'logAdElement',
    adInfo: adInfo,
    timestamp: Date.now()
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[SCAM-SCANNER] Error sending message:', chrome.runtime.lastError.message || chrome.runtime.lastError);
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
        
        if (destUrl && !shouldExcludeUrl(destUrl)) {
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
        
        if (destUrl && !shouldExcludeUrl(destUrl)) {
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
