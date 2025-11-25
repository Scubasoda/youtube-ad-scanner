/**
 * SelectorManager - Manages ad detection selectors with fallback chains
 * and automatic switching when selectors fail
 */

import { SelectorConfig } from '../types';

/**
 * Selector categories for different ad types
 */
interface SelectorCategory {
  name: string;
  selectors: SelectorConfig[];
}

/**
 * SelectorManager handles selector versioning, success tracking,
 * and automatic fallback to backup selectors
 */
export class SelectorManager {
  private categories: Map<string, SelectorCategory> = new Map();
  private readonly maxFailures = 5;
  private readonly minSuccessRate = 0.3;

  constructor() {
    this.initializeDefaultSelectors();
  }

  /**
   * Initialize default selector configurations
   */
  private initializeDefaultSelectors(): void {
    // Video player ad selectors
    this.addCategory('video-ads', [
      { selector: '.video-ads', priority: 1, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-module', priority: 2, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-player-overlay', priority: 3, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-overlay-container', priority: 4, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-text', priority: 5, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-image-overlay', priority: 6, successRate: 1, failureCount: 0 },
      { selector: 'ytd-player-legacy-desktop-watch-ads-renderer', priority: 7, successRate: 1, failureCount: 0 }
    ]);

    // Display/banner ad selectors
    this.addCategory('display-ads', [
      { selector: 'ytd-promoted-sparkles-web-renderer', priority: 1, successRate: 1, failureCount: 0 },
      { selector: 'ytd-ad-slot-renderer', priority: 2, successRate: 1, failureCount: 0 },
      { selector: 'ytd-display-ad-renderer', priority: 3, successRate: 1, failureCount: 0 },
      { selector: 'ytd-banner-promo-renderer', priority: 4, successRate: 1, failureCount: 0 },
      { selector: 'ytd-statement-banner-renderer', priority: 5, successRate: 1, failureCount: 0 }
    ]);

    // Promoted content selectors
    this.addCategory('promoted-content', [
      { selector: 'ytd-promoted-video-renderer', priority: 1, successRate: 1, failureCount: 0 },
      { selector: 'ytd-compact-promoted-video-renderer', priority: 2, successRate: 1, failureCount: 0 },
      { selector: '.ytd-promoted-video-renderer', priority: 3, successRate: 1, failureCount: 0 }
    ]);

    // In-feed ad selectors
    this.addCategory('in-feed-ads', [
      { selector: 'ytd-in-feed-ad-layout-renderer', priority: 1, successRate: 1, failureCount: 0 },
      { selector: 'ytd-ad-inline-playback-renderer', priority: 2, successRate: 1, failureCount: 0 }
    ]);

    // Overlay and card selectors
    this.addCategory('overlays', [
      { selector: '.ytp-ad-avatar-lockup-card', priority: 1, successRate: 1, failureCount: 0 },
      { selector: 'ytd-player-ads-overlay', priority: 2, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-player-overlay-layout', priority: 3, successRate: 1, failureCount: 0 }
    ]);

    // Generic pattern selectors (lower priority)
    this.addCategory('generic-patterns', [
      { selector: '[id*="ad-"]', priority: 1, successRate: 0.8, failureCount: 0 },
      { selector: '[id*="ads-"]', priority: 2, successRate: 0.8, failureCount: 0 },
      { selector: '[class*="-ad-"]', priority: 3, successRate: 0.7, failureCount: 0 },
      { selector: '[class*="ad-container"]', priority: 4, successRate: 0.7, failureCount: 0 },
      { selector: '[class*="ad_container"]', priority: 5, successRate: 0.7, failureCount: 0 },
      { selector: 'ad-slot-renderer', priority: 6, successRate: 0.8, failureCount: 0 }
    ]);

    // Data attribute selectors
    this.addCategory('data-attributes', [
      { selector: '[data-ad-id]', priority: 1, successRate: 0.9, failureCount: 0 },
      { selector: '[data-ad-slot]', priority: 2, successRate: 0.9, failureCount: 0 },
      { selector: '[data-google-query-id]', priority: 3, successRate: 0.8, failureCount: 0 }
    ]);

    // Player state indicators
    this.addCategory('player-state', [
      { selector: '.html5-video-player.ad-showing', priority: 1, successRate: 1, failureCount: 0 },
      { selector: '.html5-video-player.ad-interrupting', priority: 2, successRate: 1, failureCount: 0 }
    ]);

    // Skip button indicators
    this.addCategory('skip-buttons', [
      { selector: '.ytp-ad-skip-button', priority: 1, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-skip-button-container', priority: 2, successRate: 1, failureCount: 0 },
      { selector: '.ytp-ad-preview-container', priority: 3, successRate: 1, failureCount: 0 }
    ]);
  }

  /**
   * Add a new category of selectors
   */
  addCategory(name: string, selectors: SelectorConfig[]): void {
    this.categories.set(name, { name, selectors });
  }

  /**
   * Get all active selectors sorted by priority and success rate
   */
  getAllActiveSelectors(): string[] {
    const allSelectors: { selector: string; score: number }[] = [];
    
    this.categories.forEach(category => {
      category.selectors.forEach(config => {
        if (config.failureCount < this.maxFailures && config.successRate >= this.minSuccessRate) {
          // Score based on priority and success rate
          const score = config.successRate * (1 / config.priority);
          allSelectors.push({ selector: config.selector, score });
        }
      });
    });

    // Sort by score descending and return selectors
    return allSelectors
      .sort((a, b) => b.score - a.score)
      .map(s => s.selector);
  }

  /**
   * Get selectors for a specific category
   */
  getCategorySelectors(categoryName: string): string[] {
    const category = this.categories.get(categoryName);
    if (!category) return [];

    return category.selectors
      .filter(s => s.failureCount < this.maxFailures && s.successRate >= this.minSuccessRate)
      .sort((a, b) => (b.successRate / b.priority) - (a.successRate / a.priority))
      .map(s => s.selector);
  }

  /**
   * Record a successful selector match
   */
  recordSuccess(selector: string): void {
    this.categories.forEach(category => {
      const config = category.selectors.find(s => s.selector === selector);
      if (config) {
        config.successRate = Math.min(1, config.successRate * 1.1);
        config.lastSuccess = Date.now();
        config.failureCount = Math.max(0, config.failureCount - 1);
      }
    });
  }

  /**
   * Record a selector failure
   */
  recordFailure(selector: string): void {
    this.categories.forEach(category => {
      const config = category.selectors.find(s => s.selector === selector);
      if (config) {
        config.failureCount++;
        config.successRate *= 0.9;
      }
    });
  }

  /**
   * Add a new selector dynamically (for remote config updates)
   */
  addSelector(category: string, selector: string, priority: number = 10): void {
    const cat = this.categories.get(category);
    if (cat) {
      // Check if selector already exists
      if (!cat.selectors.some(s => s.selector === selector)) {
        cat.selectors.push({
          selector,
          priority,
          successRate: 0.5, // Start with neutral success rate
          failureCount: 0
        });
      }
    } else {
      this.addCategory(category, [{
        selector,
        priority,
        successRate: 0.5,
        failureCount: 0
      }]);
    }
  }

  /**
   * Get selector statistics for telemetry
   */
  getStatistics(): Record<string, { selector: string; successRate: number; failures: number }[]> {
    const stats: Record<string, { selector: string; successRate: number; failures: number }[]> = {};
    
    this.categories.forEach((category, name) => {
      stats[name] = category.selectors.map(s => ({
        selector: s.selector,
        successRate: s.successRate,
        failures: s.failureCount
      }));
    });

    return stats;
  }

  /**
   * Update selectors from remote configuration
   */
  updateFromConfig(config: { categories?: Record<string, string[]> }): void {
    if (config.categories) {
      Object.entries(config.categories).forEach(([categoryName, selectors]) => {
        selectors.forEach((selector, index) => {
          this.addSelector(categoryName, selector, index + 1);
        });
      });
    }
  }

  /**
   * Test if an element matches any known ad selector
   */
  matchesAnySelector(element: Element): { matched: boolean; selector?: string; category?: string } {
    for (const [categoryName, category] of this.categories.entries()) {
      for (const config of category.selectors) {
        if (config.failureCount < this.maxFailures) {
          try {
            if (element.matches(config.selector)) {
              return { matched: true, selector: config.selector, category: categoryName };
            }
          } catch {
            // Invalid selector, record failure
            config.failureCount++;
          }
        }
      }
    }
    return { matched: false };
  }
}

// Export singleton instance
export const selectorManager = new SelectorManager();
