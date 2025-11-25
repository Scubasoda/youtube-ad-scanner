/**
 * Observer utilities for efficient DOM monitoring
 * Uses IntersectionObserver and MutationObserver with debouncing
 */

import { debounce, throttle } from '../utils/performance';
import { selectorManager } from './selectors';

/**
 * Callback for element detection
 */
type ElementCallback = (element: Element, reason: string) => void;

/**
 * Options for ObserverManager
 */
interface ObserverOptions {
  scanInterval?: number;
  debounceMs?: number;
  visibleOnly?: boolean;
}

/**
 * ObserverManager - Manages mutation and intersection observers
 * for efficient DOM scanning
 */
export class ObserverManager {
  private mutationObserver: MutationObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private visibleElements: Set<Element> = new Set();
  private onElementDetected: ElementCallback;
  private options: Required<ObserverOptions>;
  private isRunning = false;
  private scanIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(callback: ElementCallback, options: ObserverOptions = {}) {
    this.onElementDetected = callback;
    this.options = {
      scanInterval: options.scanInterval ?? 2000,
      debounceMs: options.debounceMs ?? 100,
      visibleOnly: options.visibleOnly ?? false
    };
  }

  /**
   * Start observing the DOM
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.setupMutationObserver();
    this.setupIntersectionObserver();
    this.startPeriodicScan();
    
    // Initial scan
    this.performFullScan();
  }

  /**
   * Stop all observers
   */
  stop(): void {
    this.isRunning = false;

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }

    if (this.scanIntervalId) {
      clearInterval(this.scanIntervalId);
      this.scanIntervalId = null;
    }

    this.visibleElements.clear();
  }

  /**
   * Setup MutationObserver with debouncing
   */
  private setupMutationObserver(): void {
    const handleMutations = debounce((mutations: MutationRecord[]) => {
      if (!this.isRunning) return;

      mutations.forEach(mutation => {
        // Handle added nodes
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processElement(node as Element, 'mutation-added');
          }
        });

        // Handle attribute changes
        if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
          this.processElement(mutation.target as Element, 'mutation-attribute');
        }
      });
    }, this.options.debounceMs);

    this.mutationObserver = new MutationObserver(handleMutations);
    
    if (document.body) {
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'href', 'data-url', 'data-ad-id', 'src', 'class']
      });
    }
  }

  /**
   * Setup IntersectionObserver for visibility-based scanning
   */
  private setupIntersectionObserver(): void {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.visibleElements.add(entry.target);
            this.processElement(entry.target, 'intersection-visible');
          } else {
            this.visibleElements.delete(entry.target);
          }
        });
      },
      {
        root: null,
        rootMargin: '100px', // Start processing slightly before visible
        threshold: 0
      }
    );
  }

  /**
   * Observe an element for visibility
   */
  observeVisibility(element: Element): void {
    if (this.intersectionObserver) {
      this.intersectionObserver.observe(element);
    }
  }

  /**
   * Process an element and check if it's an ad container
   */
  private processElement(element: Element, reason: string): void {
    // Check if element matches any ad selector
    const match = selectorManager.matchesAnySelector(element);
    if (match.matched) {
      if (match.selector) {
        selectorManager.recordSuccess(match.selector);
      }
      
      // If visibleOnly option is set, only process visible elements
      if (this.options.visibleOnly && !this.visibleElements.has(element)) {
        // Observe for future visibility
        this.observeVisibility(element);
        return;
      }

      this.onElementDetected(element, reason);
    }

    // Also check child elements
    const selectors = selectorManager.getAllActiveSelectors();
    selectors.forEach(selector => {
      try {
        const children = element.querySelectorAll(selector);
        children.forEach(child => {
          selectorManager.recordSuccess(selector);
          
          if (this.options.visibleOnly && !this.visibleElements.has(child)) {
            this.observeVisibility(child);
            return;
          }

          this.onElementDetected(child, `${reason}-child`);
        });
      } catch {
        selectorManager.recordFailure(selector);
      }
    });
  }

  /**
   * Start periodic full DOM scan
   */
  private startPeriodicScan(): void {
    // Throttled scan function
    const throttledScan = throttle(() => {
      this.performFullScan();
    }, this.options.scanInterval);

    this.scanIntervalId = setInterval(throttledScan, this.options.scanInterval);
  }

  /**
   * Perform a full DOM scan for ad elements
   */
  performFullScan(): void {
    if (!this.isRunning) return;

    const selectors = selectorManager.getAllActiveSelectors();
    
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          selectorManager.recordSuccess(selector);
          
          if (this.options.visibleOnly && !this.visibleElements.has(element)) {
            this.observeVisibility(element);
            return;
          }

          this.onElementDetected(element, 'periodic-scan');
        });
      } catch {
        selectorManager.recordFailure(selector);
      }
    });
  }

  /**
   * Get count of currently visible elements
   */
  getVisibleCount(): number {
    return this.visibleElements.size;
  }
}

/**
 * VideoPlayerObserver - Specialized observer for YouTube video player
 */
export class VideoPlayerObserver {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onAdDetected: (isPlaying: boolean, evidence: string[]) => void;
  private lastState: boolean = false;

  constructor(callback: (isPlaying: boolean, evidence: string[]) => void) {
    this.onAdDetected = callback;
  }

  /**
   * Start observing the video player
   */
  start(): void {
    this.stop();
    this.intervalId = setInterval(() => this.checkPlayer(), 1000);
  }

  /**
   * Stop observing
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Check the video player state
   */
  private checkPlayer(): void {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;

    const evidence: string[] = [];
    
    // Check various ad indicators
    if (player.classList.contains('ad-showing')) {
      evidence.push('player-class:ad-showing');
    }
    if (player.classList.contains('ad-interrupting')) {
      evidence.push('player-class:ad-interrupting');
    }
    if (player.querySelector('.ytp-ad-text')) {
      evidence.push('element:ytp-ad-text');
    }
    if (player.querySelector('.ytp-ad-skip-button')) {
      evidence.push('element:ytp-ad-skip-button');
    }
    if (player.querySelector('.ytp-ad-preview-container')) {
      evidence.push('element:ytp-ad-preview-container');
    }
    if (document.querySelector('.ytp-ad-player-overlay-layout')) {
      evidence.push('element:ytp-ad-player-overlay-layout');
    }

    // Try to access YouTube player API
    try {
      const ytPlayer = (player as HTMLElement & { getAdState?: () => number }).getAdState;
      if (typeof ytPlayer === 'function') {
        const adState = ytPlayer();
        if (adState === 1) {
          evidence.push('api:getAdState=1');
        }
      }
    } catch {
      // API not available
    }

    const isAdPlaying = evidence.length > 0;
    
    // Only notify on state change or if ad is playing
    if (isAdPlaying !== this.lastState || isAdPlaying) {
      this.lastState = isAdPlaying;
      this.onAdDetected(isAdPlaying, evidence);
    }
  }
}
