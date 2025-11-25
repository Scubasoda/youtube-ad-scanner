/**
 * Content Script Entry Point
 * Main entry for YouTube ad scanner content script
 */

import { AdInfo, DetectionResult } from '../types';
import { createDefaultPipeline, networkDetectionStep, DetectionPipeline } from '../detection/pipeline';
import { ObserverManager, VideoPlayerObserver } from '../detection/observers';
import { adClassifier, shouldExcludeUrl } from '../detection/classifiers';
import { youtubePlayerAPI } from '../platforms/youtube/player-api';
import { youtubeUIPatterns } from '../platforms/youtube/ui-patterns';
import { debounce, performanceTracker } from '../utils/performance';
import { isAdNetworkUrl, isYouTubePageadUrl, extractDestinationUrl } from '../utils/url';

// Debug mode
const DEBUG = true;

// Logged URLs to prevent duplicates
const loggedUrls = new Set<string>();

// Detection pipeline
let pipeline: DetectionPipeline;

// Observer manager
let observerManager: ObserverManager;

// Video player observer
let videoPlayerObserver: VideoPlayerObserver;

/**
 * Log message to console in debug mode
 */
function log(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[SCAM-SCANNER]', ...args);
  }
}

/**
 * Send ad info to background script
 */
function logAd(adInfo: AdInfo): void {
  // Prevent duplicate logging
  const urlKey = `${adInfo.url}:${adInfo.source}`;
  if (loggedUrls.has(urlKey)) {
    log('Duplicate ad skipped:', adInfo.url);
    return;
  }
  loggedUrls.add(urlKey);

  log('✓ AD DETECTED:', adInfo);
  
  chrome.runtime.sendMessage({
    action: 'logAdElement',
    adInfo,
    timestamp: Date.now()
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('[SCAM-SCANNER] Error sending message:', chrome.runtime.lastError.message);
    }
    // Handle response if needed
    if (response) {
      log('Background response:', response);
    }
  });
}

/**
 * Process detection results and log ads
 */
function processDetections(detections: DetectionResult[]): void {
  detections.forEach(detection => {
    if (detection.confidence < adClassifier.getConfidenceThreshold()) {
      log('Low confidence detection skipped:', detection.confidence);
      return;
    }

    // Extract URLs from the detected element
    const element = detection.element;
    
    // Check aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.includes('.')) {
      logAd({
        url: `https://${ariaLabel}`,
        type: detection.type,
        source: 'aria-label',
        confidence: detection.confidence,
        evidence: detection.evidence
      });
    }

    // Check data attributes
    const dataUrl = element.getAttribute('data-url') || element.getAttribute('data-ad-url');
    if (dataUrl && !shouldExcludeUrl(dataUrl)) {
      logAd({
        url: dataUrl,
        type: detection.type,
        source: 'data-attribute',
        confidence: detection.confidence,
        evidence: detection.evidence
      });
    }

    // Check links
    const links = element.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = (link as HTMLAnchorElement).href;
      if (href && !shouldExcludeUrl(href)) {
        logAd({
          url: href,
          type: detection.type,
          source: 'link-href',
          confidence: detection.confidence,
          evidence: detection.evidence
        });
      }
    });

    // Check images
    const images = element.querySelectorAll('img[src]');
    images.forEach(img => {
      const src = (img as HTMLImageElement).src;
      if (src && !shouldExcludeUrl(src)) {
        logAd({
          url: src,
          type: detection.type,
          source: 'image-src',
          confidence: detection.confidence,
          evidence: detection.evidence
        });
      }
    });
  });
}

/**
 * Handle video player ad detection
 */
function handleVideoAdDetection(isPlaying: boolean, evidence: string[]): void {
  if (!isPlaying) return;

  log('Video ad detected, evidence:', evidence);

  const player = youtubePlayerAPI.findPlayer();
  if (!player) return;

  // Get ad text elements
  const adTextElements = player.querySelectorAll('.ytp-ad-text, .ytp-ad-visit-advertiser-button');
  adTextElements.forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.includes('.') && !shouldExcludeUrl(`https://${text}`)) {
      logAd({
        url: `https://${text}`,
        type: 'video-ad',
        source: 'video-player-text',
        confidence: 0.9,
        evidence
      });
    }
  });

  // Check for click-through links
  const adLinks = player.querySelectorAll('a[href*="adurl"], a[href*="googleadservices"]');
  adLinks.forEach(link => {
    const href = (link as HTMLAnchorElement).href;
    if (href) {
      // Extract destination URL from Google redirect
      try {
        const url = new URL(href);
        const destUrl = url.searchParams.get('adurl') || 
                       url.searchParams.get('url') ||
                       url.searchParams.get('q');
        
        if (destUrl && !shouldExcludeUrl(destUrl)) {
          logAd({
            url: destUrl,
            type: 'video-ad',
            source: 'video-player-link',
            confidence: 0.85,
            evidence
          });
        }
      } catch {
        // Invalid URL
      }
    }
  });
}

/**
 * Handle element detected by observer
 */
function handleElementDetected(element: Element, reason: string): void {
  log('Element detected:', reason, element.tagName, element.className);
  
  if (element instanceof HTMLElement) {
    const result = adClassifier.classify(element, [`detected:${reason}`]);
    if (result.confidence >= adClassifier.getConfidenceThreshold()) {
      processDetections([result]);
    }
  }
}

/**
 * Run the detection pipeline
 */
const runPipeline = debounce(() => {
  const detections = pipeline.run();
  if (detections.length > 0) {
    log(`Pipeline detected ${detections.length} ads`);
    processDetections(detections);
  }
}, 100);

/**
 * Setup network interception
 * Note: Modifying global prototypes (fetch/XMLHttpRequest) is necessary here because:
 * 1. The webRequest API only intercepts browser-initiated requests, not page-initiated ones
 * 2. YouTube's ad system uses fetch/XHR to load ad content
 * 3. This is a common pattern in browser extensions for content script interception
 * The implementation preserves original functionality and only observes, not blocks.
 */
function setupNetworkInterception(): void {
  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = args[0];
    if (typeof url === 'string') {
      try {
        // Use safe hostname matching instead of substring includes
        if (isAdNetworkUrl(url) || isYouTubePageadUrl(url)) {
          const destUrl = extractDestinationUrl(url);
          
          if (destUrl && !shouldExcludeUrl(destUrl)) {
            networkDetectionStep.addDetectedUrl(destUrl);
            logAd({
              url: destUrl,
              type: 'network-ad',
              source: 'fetch-extracted',
              confidence: 0.8,
              evidence: ['network:fetch-intercept']
            });
          }
        }
      } catch {
        // Invalid URL
      }
    }
    return originalFetch.apply(this, args);
  };

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null) {
    if (typeof url === 'string') {
      try {
        // Use safe hostname matching instead of substring includes
        if (isAdNetworkUrl(url) || isYouTubePageadUrl(url)) {
          const destUrl = extractDestinationUrl(url);
          
          if (destUrl && !shouldExcludeUrl(destUrl)) {
            networkDetectionStep.addDetectedUrl(destUrl);
            logAd({
              url: destUrl,
              type: 'network-ad',
              source: 'xhr-extracted',
              confidence: 0.8,
              evidence: ['network:xhr-intercept']
            });
          }
        }
      } catch {
        // Invalid URL
      }
    }
    return originalXHROpen.call(this, method, url, async ?? true, username, password);
  };
}

/**
 * Initialize the content script
 */
function initialize(): void {
  log('Initializing ad scanner...');

  // Create detection pipeline
  pipeline = createDefaultPipeline();

  // Setup network interception
  setupNetworkInterception();

  // Create observer manager
  observerManager = new ObserverManager(handleElementDetected, {
    scanInterval: 2000,
    debounceMs: 100,
    visibleOnly: false
  });

  // Create video player observer
  videoPlayerObserver = new VideoPlayerObserver(handleVideoAdDetection);

  // Start observing when document body is ready
  if (document.body) {
    startScanning();
  } else {
    document.addEventListener('DOMContentLoaded', startScanning);
  }
}

/**
 * Start scanning for ads
 */
function startScanning(): void {
  log('Starting ad scanning...');

  // Start observers
  observerManager.start();
  videoPlayerObserver.start();

  // Run initial pipeline scan
  runPipeline();

  // Setup periodic UI pattern checks
  setInterval(() => {
    const patterns = youtubeUIPatterns.detectPatterns();
    if (patterns.length > 0) {
      log(`Detected ${patterns.length} UI patterns`);
      
      // Check for skip button
      if (youtubeUIPatterns.isSkipButtonVisible()) {
        log('Skip button visible');
      }

      // Check remaining time
      const remainingTime = youtubeUIPatterns.getRemainingTime();
      if (remainingTime !== null) {
        log('Ad remaining time:', remainingTime, 'seconds');
      }
    }
  }, 1000);

  // Run pipeline periodically
  setInterval(runPipeline, 2000);
}

/**
 * Debug helper - expose to window
 */
function debugAdScanner(): void {
  console.log('=== AD SCANNER DEBUG INFO ===');
  console.log('Pipeline stats:', pipeline.getStats());
  console.log('Performance stats:', performanceTracker.getStats());
  console.log('Player API state:', {
    isAdPlaying: youtubePlayerAPI.isAdPlaying(),
    adState: youtubePlayerAPI.getAdState(),
    playerState: youtubePlayerAPI.getPlayerState(),
    currentTime: youtubePlayerAPI.getCurrentTime(),
    videoId: youtubePlayerAPI.getVideoId()
  });
  console.log('UI Patterns:', youtubeUIPatterns.detectPatterns());
  console.log('=========================');
}

// Expose debug helper
(window as Window & { debugAdScanner?: () => void }).debugAdScanner = debugAdScanner;

// Initialize
log('Focused ad scanner active');
initialize();
