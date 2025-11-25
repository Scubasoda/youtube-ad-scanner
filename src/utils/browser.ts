/**
 * Browser API Abstraction Layer
 * Provides a unified API for Chrome, Firefox, and other browsers
 */

// Declare the Firefox browser global
declare const browser: typeof chrome | undefined;

/**
 * Detect the current browser
 */
export type BrowserType = 'chrome' | 'firefox' | 'edge' | 'safari' | 'unknown';

export function detectBrowser(): BrowserType {
  // Check for Firefox
  if (typeof browser !== 'undefined' && browser.runtime) {
    return 'firefox';
  }
  
  // Check for Chrome
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('edg/')) {
      return 'edge';
    }
    return 'chrome';
  }
  
  // Check for Safari
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('safari') && !ua.includes('chrome')) {
    return 'safari';
  }
  
  return 'unknown';
}

/**
 * Browser API interface
 */
interface BrowserAPI {
  runtime: {
    sendMessage: (message: unknown, callback?: (response: unknown) => void) => void;
    onMessage: {
      addListener: (callback: (request: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void) => void;
    };
    lastError: chrome.runtime.LastError | undefined;
    onInstalled: {
      addListener: (callback: (details: { reason: string; previousVersion?: string }) => void) => void;
    };
  };
  storage: {
    local: {
      get: (keys: string | string[], callback: (result: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, callback?: () => void) => void;
    };
  };
  downloads: {
    download: (options: { url: string; filename: string; saveAs?: boolean }, callback?: (downloadId: number) => void) => void;
  };
}

/**
 * Get the browser API
 * Works across Chrome, Firefox, Edge, and Safari
 */
export function getBrowserAPI(): BrowserAPI {
  // Firefox uses 'browser' with Promises
  if (typeof browser !== 'undefined') {
    // Wrap Firefox Promise-based API to callback style for consistency
    return {
      runtime: {
        sendMessage: (message, callback) => {
          browser.runtime.sendMessage(message).then(callback).catch(() => {});
        },
        onMessage: browser.runtime.onMessage,
        lastError: undefined,
        onInstalled: browser.runtime.onInstalled
      },
      storage: {
        local: {
          get: (keys, callback) => {
            browser.storage.local.get(keys).then(callback).catch(() => callback({}));
          },
          set: (items, callback) => {
            browser.storage.local.set(items).then(callback).catch(() => {});
          }
        }
      },
      downloads: {
        download: (options, callback) => {
          browser.downloads.download(options).then(callback).catch(() => {});
        }
      }
    };
  }
  
  // Chrome and Edge use 'chrome' with callbacks
  if (typeof chrome !== 'undefined') {
    return {
      runtime: chrome.runtime,
      storage: chrome.storage,
      downloads: chrome.downloads
    };
  }
  
  // Fallback for testing environments
  console.warn('[BROWSER-API] No browser API detected, using mock');
  return {
    runtime: {
      sendMessage: () => {},
      onMessage: { addListener: () => {} },
      lastError: undefined,
      onInstalled: { addListener: () => {} }
    },
    storage: {
      local: {
        get: (_, callback) => callback({}),
        set: () => {}
      }
    },
    downloads: {
      download: () => {}
    }
  };
}

/**
 * Check if running on mobile
 */
export function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Check if on YouTube mobile site
 */
export function isYouTubeMobile(): boolean {
  return window.location.hostname === 'm.youtube.com';
}

/**
 * Get platform-specific selectors
 */
export function getPlatformSelectors(): { mobile: string[]; desktop: string[] } {
  return {
    mobile: [
      // Mobile YouTube selectors
      '.mobile-topbar-header-content',
      'ytm-promoted-sparkles-web-renderer',
      'ytm-ad-slot-renderer',
      'ytm-companion-slot',
      '.ytp-ad-module',
      '.ytp-ad-player-overlay',
      'ytm-promoted-video-renderer'
    ],
    desktop: [
      // Desktop YouTube selectors
      'ytd-promoted-sparkles-web-renderer',
      'ytd-ad-slot-renderer',
      'ytd-display-ad-renderer',
      'ytd-promoted-video-renderer',
      'ytd-in-feed-ad-layout-renderer',
      '.ytp-ad-module',
      '.video-ads'
    ]
  };
}

// Export singleton
export const browserAPI = getBrowserAPI();
export const currentBrowser = detectBrowser();
