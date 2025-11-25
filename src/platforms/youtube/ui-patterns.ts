/**
 * YouTube UI Pattern Detection
 */

/**
 * UI pattern types
 */
export type UIPatternType = 
  | 'skip-button'
  | 'ad-badge'
  | 'countdown-timer'
  | 'ad-overlay'
  | 'sponsored-card'
  | 'promoted-content'
  | 'ad-banner';

/**
 * Detected UI pattern
 */
export interface UIPattern {
  type: UIPatternType;
  element: Element;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * UI pattern selectors for different ad indicators
 */
const UI_PATTERNS: Record<UIPatternType, string[]> = {
  'skip-button': [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-container',
    '.ytp-ad-skip-button-text',
    'button.ytp-ad-skip-button-modern',
    '.videoAdUiSkipButton'
  ],
  'ad-badge': [
    '.ytp-ad-badge',
    '.ytp-ad-simple-ad-badge',
    '[aria-label*="Ad"]',
    '.badge-style-type-ad',
    '.ytd-badge-supported-renderer[aria-label="Ad"]'
  ],
  'countdown-timer': [
    '.ytp-ad-duration-remaining',
    '.ytp-ad-preview-text',
    '.ytp-ad-preview-container',
    '.videoAdUiPreviewContainer'
  ],
  'ad-overlay': [
    '.ytp-ad-player-overlay',
    '.ytp-ad-player-overlay-layout',
    '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay',
    '.videoAdUiOverlay'
  ],
  'sponsored-card': [
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    '.ytd-promoted-sparkles-web-renderer',
    'ytd-action-companion-ad-renderer'
  ],
  'promoted-content': [
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-ad-slot-renderer',
    'ytd-video-masthead-ad-v3-renderer'
  ],
  'ad-banner': [
    'ytd-display-ad-renderer',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    'ytd-primetime-promo-renderer',
    '.masthead-ad-control'
  ]
};

/**
 * Confidence scores for different pattern types
 */
const PATTERN_CONFIDENCE: Record<UIPatternType, number> = {
  'skip-button': 0.95,
  'ad-badge': 0.9,
  'countdown-timer': 0.85,
  'ad-overlay': 0.85,
  'sponsored-card': 0.9,
  'promoted-content': 0.85,
  'ad-banner': 0.8
};

/**
 * YouTubeUIPatterns - Detects ad-related UI patterns
 */
export class YouTubeUIPatterns {
  /**
   * Detect all UI patterns on the page
   */
  detectPatterns(): UIPattern[] {
    const patterns: UIPattern[] = [];

    for (const [type, selectors] of Object.entries(UI_PATTERNS)) {
      const patternType = type as UIPatternType;
      
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            // Avoid duplicate detections for same element
            if (!patterns.some(p => p.element === element)) {
              patterns.push({
                type: patternType,
                element,
                confidence: PATTERN_CONFIDENCE[patternType],
                metadata: this.extractMetadata(element, patternType)
              });
            }
          });
        } catch {
          // Invalid selector, skip
        }
      }
    }

    return patterns;
  }

  /**
   * Detect a specific pattern type
   */
  detectPattern(type: UIPatternType): UIPattern[] {
    const patterns: UIPattern[] = [];
    const selectors = UI_PATTERNS[type] || [];

    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          patterns.push({
            type,
            element,
            confidence: PATTERN_CONFIDENCE[type],
            metadata: this.extractMetadata(element, type)
          });
        });
      } catch {
        // Invalid selector, skip
      }
    }

    return patterns;
  }

  /**
   * Check if skip button is currently visible
   */
  isSkipButtonVisible(): boolean {
    const skipPatterns = this.detectPattern('skip-button');
    return skipPatterns.some(p => this.isElementVisible(p.element));
  }

  /**
   * Get remaining ad time if available
   */
  getRemainingTime(): number | null {
    const countdownPatterns = this.detectPattern('countdown-timer');
    
    for (const pattern of countdownPatterns) {
      const text = pattern.element.textContent?.trim();
      if (text) {
        // Parse time formats like "0:05" or "5 seconds"
        const match = text.match(/(\d+):(\d+)/) || text.match(/(\d+)\s*second/i);
        if (match) {
          if (match[2]) {
            // MM:SS format
            return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
          } else {
            // "N seconds" format
            return parseInt(match[1], 10);
          }
        }
      }
    }

    return null;
  }

  /**
   * Check if any ad overlay is currently displayed
   */
  hasAdOverlay(): boolean {
    const overlayPatterns = this.detectPattern('ad-overlay');
    return overlayPatterns.some(p => this.isElementVisible(p.element));
  }

  /**
   * Get evidence strings from detected patterns
   */
  getPatternEvidence(): string[] {
    const patterns = this.detectPatterns();
    return patterns.map(p => `ui-pattern:${p.type}`);
  }

  /**
   * Extract metadata from detected element
   */
  private extractMetadata(element: Element, type: UIPatternType): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    switch (type) {
      case 'countdown-timer':
        metadata.text = element.textContent?.trim();
        metadata.remainingTime = this.parseTimeText(element.textContent?.trim());
        break;
        
      case 'skip-button':
        metadata.text = element.textContent?.trim();
        metadata.isClickable = element.matches('button') || element.closest('button') !== null;
        break;
        
      case 'sponsored-card':
      case 'promoted-content':
        metadata.ariaLabel = element.getAttribute('aria-label');
        const link = element.querySelector('a[href]');
        if (link) {
          metadata.href = (link as HTMLAnchorElement).href;
        }
        break;
        
      case 'ad-badge':
        metadata.text = element.textContent?.trim();
        break;
    }

    return metadata;
  }

  /**
   * Parse time text to seconds
   */
  private parseTimeText(text?: string | null): number | null {
    if (!text) return null;
    
    const mmss = text.match(/(\d+):(\d+)/);
    if (mmss) {
      return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    }
    
    const seconds = text.match(/(\d+)\s*second/i);
    if (seconds) {
      return parseInt(seconds[1], 10);
    }
    
    return null;
  }

  /**
   * Check if element is visible
   */
  private isElementVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    
    return true;
  }

  /**
   * Detect z-index anomalies that might indicate click-jacking
   */
  detectZIndexAnomalies(): { element: Element; zIndex: number }[] {
    const anomalies: { element: Element; zIndex: number }[] = [];
    
    const elements = document.querySelectorAll('[style*="z-index"]');
    elements.forEach(element => {
      const style = window.getComputedStyle(element);
      const zIndex = parseInt(style.zIndex, 10);
      
      // High z-index with ad-related class/id
      if (zIndex > 9999) {
        const className = element.className || '';
        const id = element.id || '';
        if (className.toLowerCase().includes('ad') || id.toLowerCase().includes('ad')) {
          anomalies.push({ element, zIndex });
        }
      }
    });
    
    return anomalies;
  }
}

// Export singleton instance
export const youtubeUIPatterns = new YouTubeUIPatterns();
