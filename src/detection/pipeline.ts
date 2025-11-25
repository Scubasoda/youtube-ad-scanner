/**
 * DetectionPipeline - Chain-of-responsibility pattern for ad detection
 */

import { DetectionResult, StepResult, AdInfo } from '../types';
import { selectorManager } from './selectors';
import { adClassifier, extractAdUrls, shouldExcludeUrl, isValidAdDomain } from './classifiers';
import { performanceTracker } from '../utils/performance';

/**
 * Abstract detection step interface
 */
export interface DetectionStep {
  name: string;
  execute(context: DetectionContext): StepResult;
}

/**
 * Context passed through the detection pipeline
 */
export interface DetectionContext {
  element?: Element;
  document: Document;
  detections: DetectionResult[];
  evidence: string[];
}

/**
 * DOM Selector-based detection step
 */
export class DomSelectorStep implements DetectionStep {
  name = 'DomSelectorStep';

  execute(context: DetectionContext): StepResult {
    const stop = performanceTracker.start('dom-selector-detection');
    const evidence: string[] = [];
    const ads: DetectionResult[] = [];

    try {
      const selectors = selectorManager.getAllActiveSelectors();
      
      for (const selector of selectors) {
        try {
          const elements = context.document.querySelectorAll(selector);
          elements.forEach(element => {
            selectorManager.recordSuccess(selector);
            evidence.push(`selector:${selector}`);
            
            if (element instanceof HTMLElement) {
              // Extract additional evidence from element
              const elementEvidence = this.extractElementEvidence(element);
              const allEvidence = [...evidence, ...elementEvidence];
              
              const result = adClassifier.classify(element, allEvidence);
              if (result.confidence >= adClassifier.getConfidenceThreshold()) {
                ads.push(result);
              }
            }
          });
        } catch {
          selectorManager.recordFailure(selector);
        }
      }
    } finally {
      stop();
    }

    return {
      detected: ads.length > 0,
      confidence: ads.length > 0 ? Math.max(...ads.map(a => a.confidence)) : 0,
      evidence,
      ads
    };
  }

  private extractElementEvidence(element: HTMLElement): string[] {
    const evidence: string[] = [];
    
    // Check for common ad attributes
    if (element.getAttribute('data-ad-id')) {
      evidence.push('attribute:data-ad-id');
    }
    if (element.getAttribute('data-google-query-id')) {
      evidence.push('attribute:data-google-query-id');
    }
    
    // Check class names
    const className = element.className;
    if (typeof className === 'string') {
      if (className.includes('ad-')) evidence.push('class:contains-ad');
      if (className.includes('sponsored')) evidence.push('class:sponsored');
      if (className.includes('promoted')) evidence.push('class:promoted');
    }

    return evidence;
  }
}

/**
 * YouTube Player API detection step
 */
export class ApiDetectionStep implements DetectionStep {
  name = 'ApiDetectionStep';

  execute(context: DetectionContext): StepResult {
    const stop = performanceTracker.start('api-detection');
    const evidence: string[] = [];

    try {
      const player = context.document.querySelector('.html5-video-player');
      if (!player) {
        return { detected: false, confidence: 0, evidence: [] };
      }

      // Check player classes
      if (player.classList.contains('ad-showing')) {
        evidence.push('player-class:ad-showing');
      }
      if (player.classList.contains('ad-interrupting')) {
        evidence.push('player-class:ad-interrupting');
      }

      // Try to access YouTube player API
      try {
        interface YouTubePlayer extends HTMLElement {
          getAdState?: () => number;
          getPlayerState?: () => number;
          getCurrentTime?: () => number;
        }
        
        const ytPlayer = player as YouTubePlayer;
        if (typeof ytPlayer.getAdState === 'function') {
          const adState = ytPlayer.getAdState();
          if (adState === 1) {
            evidence.push('api:getAdState=1');
          }
        }
      } catch {
        // API not available
      }
    } finally {
      stop();
    }

    const detected = evidence.length > 0;
    return {
      detected,
      confidence: detected ? 0.95 : 0,
      evidence
    };
  }
}

/**
 * Visual analysis detection step (checks UI patterns)
 */
export class VisualAnalysisStep implements DetectionStep {
  name = 'VisualAnalysisStep';

  execute(context: DetectionContext): StepResult {
    const stop = performanceTracker.start('visual-analysis');
    const evidence: string[] = [];

    try {
      // Check for skip button
      const skipButton = context.document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-container');
      if (skipButton) {
        evidence.push('element:ytp-ad-skip-button');
      }

      // Check for ad preview container
      const previewContainer = context.document.querySelector('.ytp-ad-preview-container');
      if (previewContainer) {
        evidence.push('element:ytp-ad-preview-container');
      }

      // Check for ad text overlay
      const adText = context.document.querySelector('.ytp-ad-text');
      if (adText) {
        evidence.push('element:ytp-ad-text');
      }

      // Check for ad overlay layout
      const overlayLayout = context.document.querySelector('.ytp-ad-player-overlay-layout');
      if (overlayLayout) {
        evidence.push('element:ytp-ad-player-overlay-layout');
      }

      // Check for "Ad" badge
      const adBadge = context.document.querySelector('.ytp-ad-badge, [aria-label*="Ad"]');
      if (adBadge) {
        evidence.push('element:ad-badge');
      }

      // Check for countdown timer
      const countdown = context.document.querySelector('.ytp-ad-duration-remaining');
      if (countdown) {
        evidence.push('element:ad-countdown');
      }

      // Check for sponsored card
      const sponsoredCard = context.document.querySelector('ytd-promoted-sparkles-web-renderer');
      if (sponsoredCard) {
        evidence.push('element:ytd-promoted-sparkles-web-renderer');
      }
    } finally {
      stop();
    }

    const detected = evidence.length > 0;
    return {
      detected,
      confidence: detected ? Math.min(0.9, 0.3 + evidence.length * 0.15) : 0,
      evidence
    };
  }
}

/**
 * Heuristic validation step (validates other detections)
 */
export class HeuristicValidationStep implements DetectionStep {
  name = 'HeuristicValidationStep';

  execute(context: DetectionContext): StepResult {
    const stop = performanceTracker.start('heuristic-validation');
    const evidence: string[] = [];

    try {
      // Validate video element behavior
      const video = context.document.querySelector('video');
      if (video instanceof HTMLVideoElement) {
        // Check for duplicate video elements (ad indicator)
        const videos = context.document.querySelectorAll('video');
        if (videos.length > 1) {
          evidence.push('heuristic:multiple-videos');
        }

        // Check video source patterns
        const src = video.src || video.currentSrc;
        if (src && src.includes('googlevideo.com/videoplayback')) {
          // Check for ad-related parameters
          if (src.includes('source=youtube_ad') || src.includes('oad=')) {
            evidence.push('heuristic:ad-video-source');
          }
        }
      }

      // Check URL patterns
      const currentUrl = context.document.location?.href || '';
      if (currentUrl.includes('&ad_') || currentUrl.includes('?ad_')) {
        evidence.push('heuristic:ad-url-params');
      }

      // Check for z-index anomalies (potential click-jacking)
      const overlays = context.document.querySelectorAll('[style*="z-index"]');
      overlays.forEach(overlay => {
        const style = window.getComputedStyle(overlay);
        const zIndex = parseInt(style.zIndex, 10);
        if (zIndex > 1000 && overlay.className?.includes('ad')) {
          evidence.push('heuristic:high-z-index-ad');
        }
      });
    } finally {
      stop();
    }

    const detected = evidence.length > 0;
    return {
      detected,
      confidence: detected ? 0.6 + evidence.length * 0.1 : 0,
      evidence
    };
  }
}

/**
 * Network request detection step
 */
export class NetworkDetectionStep implements DetectionStep {
  name = 'NetworkDetectionStep';
  private detectedUrls: Set<string> = new Set();

  execute(_context: DetectionContext): StepResult {
    // This step relies on intercepted network requests
    // The actual interception happens in the content script
    const evidence = Array.from(this.detectedUrls).map(url => `network:${url}`);
    
    return {
      detected: evidence.length > 0,
      confidence: evidence.length > 0 ? 0.8 : 0,
      evidence
    };
  }

  /**
   * Add a detected ad URL from network interception
   */
  addDetectedUrl(url: string): void {
    if (!shouldExcludeUrl(url)) {
      this.detectedUrls.add(url);
    }
  }

  /**
   * Clear detected URLs
   */
  clear(): void {
    this.detectedUrls.clear();
  }
}

/**
 * Content analysis step - extracts ad information from detected elements
 */
export class ContentAnalysisStep implements DetectionStep {
  name = 'ContentAnalysisStep';

  execute(context: DetectionContext): StepResult {
    const stop = performanceTracker.start('content-analysis');
    const evidence: string[] = [];
    const adInfos: AdInfo[] = [];

    try {
      // Process all detected elements
      context.detections.forEach(detection => {
        const urls = extractAdUrls(detection.element);
        urls.forEach(({ url, evidence: urlEvidence }) => {
          evidence.push(urlEvidence);
          adInfos.push({
            url,
            type: detection.type,
            source: urlEvidence,
            confidence: detection.confidence,
            evidence: [...detection.evidence, urlEvidence]
          });
        });
      });

      // Also scan for video ad text
      const player = context.document.querySelector('.html5-video-player');
      if (player) {
        const adTextElements = player.querySelectorAll('.ytp-ad-text, .ytp-ad-visit-advertiser-button');
        adTextElements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && isValidAdDomain(text)) {
            evidence.push('content:video-ad-text');
            adInfos.push({
              url: `https://${text}`,
              type: 'video-ad',
              source: 'video-player-text',
              confidence: 0.85,
              evidence: ['content:video-ad-text']
            });
          }
        });
      }
    } finally {
      stop();
    }

    return {
      detected: adInfos.length > 0,
      confidence: adInfos.length > 0 ? Math.max(...adInfos.map(a => a.confidence || 0.5)) : 0,
      evidence
    };
  }
}

/**
 * DetectionPipeline - Orchestrates detection steps
 */
export class DetectionPipeline {
  private steps: DetectionStep[];
  private lastRunTime = 0;
  private minInterval = 100; // ms between runs

  constructor(steps: DetectionStep[]) {
    this.steps = steps;
  }

  /**
   * Run the detection pipeline
   */
  run(doc: Document = document): DetectionResult[] {
    // Throttle pipeline runs
    const now = Date.now();
    if (now - this.lastRunTime < this.minInterval) {
      return [];
    }
    this.lastRunTime = now;

    const stop = performanceTracker.start('detection-pipeline-total');
    
    const context: DetectionContext = {
      document: doc,
      detections: [],
      evidence: []
    };

    try {
      // Run each step in order
      for (const step of this.steps) {
        const result = step.execute(context);
        
        // Merge evidence
        context.evidence.push(...result.evidence);
        
        // Merge detections if any
        if (result.ads) {
          context.detections.push(...result.ads);
        }
      }
    } finally {
      stop();
    }

    // Return unique detections (by element)
    const seen = new WeakSet<Element>();
    return context.detections.filter(d => {
      if (seen.has(d.element)) return false;
      seen.add(d.element);
      return true;
    });
  }

  /**
   * Add a step to the pipeline
   */
  addStep(step: DetectionStep): void {
    this.steps.push(step);
  }

  /**
   * Get pipeline statistics
   */
  getStats(): Record<string, { avg: number; min: number; max: number; count: number }> {
    return performanceTracker.getStats();
  }
}

/**
 * Create default detection pipeline
 */
export function createDefaultPipeline(): DetectionPipeline {
  return new DetectionPipeline([
    new ApiDetectionStep(),
    new DomSelectorStep(),
    new VisualAnalysisStep(),
    new HeuristicValidationStep(),
    new ContentAnalysisStep()
  ]);
}

// Export singleton network step for use in content script
export const networkDetectionStep = new NetworkDetectionStep();
