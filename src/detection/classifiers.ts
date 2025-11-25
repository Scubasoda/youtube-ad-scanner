/**
 * Classifiers for confidence scoring in ad detection
 */

import { AdType, DetectionResult } from '../types';

/**
 * Valid TLDs for domain validation
 */
const VALID_TLDS = [
  '.com', '.net', '.org', '.io', '.co', '.au', '.uk', '.ca', '.de', '.fr',
  '.it', '.es', '.nl', '.be', '.ch', '.at', '.nz', '.jp', '.in', '.us',
  '.ai', '.app', '.dev', '.tech', '.online', '.store', '.shop', '.site',
  '.xyz', '.me', '.tv', '.cc', '.info', '.biz', '.pro', '.ly'
];

/**
 * Words to exclude from domain detection
 */
const EXCLUDE_WORDS = [
  'play', 'plays', 'like', 'likes', 'share', 'save', 'subscribe',
  'channel', 'youtube', 'google', 'video', 'watch'
];

/**
 * Domains to exclude (Google/YouTube infrastructure)
 */
const EXCLUDE_DOMAINS = [
  'youtube.com', 'ytimg.com', 'ggpht.com', 'googleusercontent.com',
  'googlevideo.com', 'gstatic.com', 'google.com', 'googleapis.com',
  'doubleclick.net', 'googleadservices.com', 'googlesyndication.com'
];

/**
 * Confidence weights for different evidence types
 */
const EVIDENCE_WEIGHTS: Record<string, number> = {
  // High confidence indicators
  'player-class:ad-showing': 0.95,
  'player-class:ad-interrupting': 0.95,
  'api:getAdState=1': 0.98,
  'element:ytp-ad-skip-button': 0.9,
  'element:ytp-ad-text': 0.85,
  'element:ytp-ad-preview-container': 0.85,
  'element:ytp-ad-player-overlay-layout': 0.9,
  
  // Medium confidence indicators
  'selector:ytd-promoted-sparkles-web-renderer': 0.9,
  'selector:ytd-ad-slot-renderer': 0.85,
  'selector:ytd-display-ad-renderer': 0.85,
  'selector:ytd-promoted-video-renderer': 0.85,
  'selector:ytd-in-feed-ad-layout-renderer': 0.85,
  
  // Lower confidence indicators
  'selector:[data-ad-id]': 0.7,
  'selector:[data-google-query-id]': 0.65,
  'selector:[class*="-ad-"]': 0.5,
  'selector:[id*="ad-"]': 0.4,
  
  // Content-based indicators
  'content:external-url': 0.6,
  'content:aria-label-domain': 0.7,
  'content:data-url': 0.75,
  'network:ad-service-url': 0.8
};

/**
 * Calculate confidence score from evidence
 */
export function calculateConfidence(evidence: string[]): number {
  if (evidence.length === 0) return 0;

  // Use a weighted approach - higher weights have more influence
  let maxWeight = 0;
  let totalWeight = 0;
  let weightedSum = 0;

  evidence.forEach(e => {
    // Find matching weight pattern
    let weight = 0.5; // Default weight
    for (const [pattern, w] of Object.entries(EVIDENCE_WEIGHTS)) {
      if (e.includes(pattern) || e.startsWith(pattern.split(':')[0])) {
        weight = Math.max(weight, w);
      }
    }
    
    maxWeight = Math.max(maxWeight, weight);
    totalWeight += weight;
    weightedSum += weight * weight; // Squared for emphasis on strong signals
  });

  // Combine max confidence with average, favoring max
  const avgWeight = weightedSum / totalWeight;
  const confidence = maxWeight * 0.7 + avgWeight * 0.3;

  // Boost confidence if multiple strong signals
  const strongSignals = evidence.filter(e => 
    Object.entries(EVIDENCE_WEIGHTS).some(([p, w]) => w > 0.8 && e.includes(p))
  ).length;
  
  const boost = Math.min(0.1, strongSignals * 0.03);

  return Math.min(1, confidence + boost);
}

/**
 * Determine ad type from evidence and element
 */
export function classifyAdType(element: Element, evidence: string[]): AdType {
  const evidenceStr = evidence.join(' ');
  const className = element.className || '';
  const tagName = element.tagName.toLowerCase();

  // Video ads
  if (evidenceStr.includes('ad-showing') || 
      evidenceStr.includes('ad-interrupting') ||
      evidenceStr.includes('getAdState')) {
    // Determine if preroll or midroll based on video state
    const video = document.querySelector('video');
    if (video && video.currentTime < 5) {
      return 'preroll';
    }
    return 'midroll';
  }

  // Overlay ads
  if (className.includes('overlay') || 
      evidenceStr.includes('overlay') ||
      tagName.includes('overlay')) {
    return 'overlay';
  }

  // Banner ads
  if (className.includes('banner') ||
      tagName.includes('banner') ||
      evidenceStr.includes('banner')) {
    return 'banner';
  }

  // Sponsored content
  if (className.includes('promoted') ||
      tagName.includes('promoted') ||
      evidenceStr.includes('promoted') ||
      evidenceStr.includes('sparkles')) {
    return 'sponsored';
  }

  // Display ads
  if (className.includes('display') ||
      tagName.includes('display') ||
      evidenceStr.includes('display')) {
    return 'display-ad';
  }

  // Default based on evidence
  if (evidenceStr.includes('network')) {
    return 'network-ad';
  }

  return 'display-ad';
}

/**
 * Validate if a URL should be excluded
 */
export function shouldExcludeUrl(url: string): boolean {
  if (!url) return true;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Exclude if matches any excluded domain
    if (EXCLUDE_DOMAINS.some(domain => hostname.includes(domain))) {
      return true;
    }

    return false;
  } catch {
    return true; // Invalid URL
  }
}

/**
 * Validate if text looks like a valid ad domain
 */
export function isValidAdDomain(text: string): boolean {
  // Must contain a dot
  if (!text.includes('.')) return false;

  // Must end with valid TLD
  if (!VALID_TLDS.some(tld => text.toLowerCase().endsWith(tld))) return false;

  // Exclude common UI words
  if (EXCLUDE_WORDS.some(word => text.toLowerCase().includes(word))) return false;

  // Exclude Google/YouTube domains
  if (EXCLUDE_DOMAINS.some(domain => text.toLowerCase().includes(domain))) return false;

  // Must look like a domain (letters/numbers/hyphens only)
  if (!/^[a-zA-Z0-9.-]+$/.test(text)) return false;

  return true;
}

/**
 * Extract ad URLs from an element
 */
export function extractAdUrls(element: Element): { url: string; evidence: string }[] {
  const urls: { url: string; evidence: string }[] = [];

  // Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && isValidAdDomain(ariaLabel)) {
    urls.push({ url: `https://${ariaLabel}`, evidence: 'content:aria-label-domain' });
  }

  // Check data attributes
  const dataUrl = element.getAttribute('data-url') || element.getAttribute('data-ad-url');
  if (dataUrl && !shouldExcludeUrl(dataUrl)) {
    urls.push({ url: dataUrl, evidence: 'content:data-url' });
  }

  // Check links
  const links = element.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = (link as HTMLAnchorElement).href;
    if (href && !shouldExcludeUrl(href)) {
      urls.push({ url: href, evidence: 'content:external-url' });
    }
  });

  // Check images
  const images = element.querySelectorAll('img[src]');
  images.forEach(img => {
    const src = (img as HTMLImageElement).src;
    if (src && !shouldExcludeUrl(src)) {
      urls.push({ url: src, evidence: 'content:external-url' });
    }
  });

  // Walk text nodes for domains
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent?.trim();
    if (text && text.length > 5 && text.length < 100 && isValidAdDomain(text)) {
      urls.push({ url: `https://${text}`, evidence: 'content:text-node-domain' });
    }
  }

  return urls;
}

/**
 * Create a DetectionResult from element and evidence
 */
export function createDetectionResult(
  element: HTMLElement,
  evidence: string[]
): DetectionResult {
  return {
    element,
    type: classifyAdType(element, evidence),
    confidence: calculateConfidence(evidence),
    evidence,
    timestamp: Date.now()
  };
}

/**
 * AdClassifier class for reusable classification
 */
export class AdClassifier {
  private detectionCache: WeakMap<Element, DetectionResult> = new WeakMap();
  private cacheTimeout = 2000; // ms

  /**
   * Classify an element
   */
  classify(element: HTMLElement, evidence: string[]): DetectionResult {
    // Check cache
    const cached = this.detectionCache.get(element);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      // Merge new evidence if any
      if (evidence.length > 0) {
        const mergedEvidence = [...new Set([...cached.evidence, ...evidence])];
        if (mergedEvidence.length > cached.evidence.length) {
          const updated = createDetectionResult(element, mergedEvidence);
          this.detectionCache.set(element, updated);
          return updated;
        }
      }
      return cached;
    }

    const result = createDetectionResult(element, evidence);
    this.detectionCache.set(element, result);
    return result;
  }

  /**
   * Check if element was recently classified
   */
  hasRecentClassification(element: Element): boolean {
    const cached = this.detectionCache.get(element);
    return cached !== undefined && Date.now() - cached.timestamp < this.cacheTimeout;
  }

  /**
   * Get minimum confidence threshold for ad reporting
   */
  getConfidenceThreshold(): number {
    return 0.6; // 60% confidence required to report as ad
  }
}

// Export singleton instance
export const adClassifier = new AdClassifier();
