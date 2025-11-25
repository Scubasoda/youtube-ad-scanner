/**
 * URL utilities for safe URL handling
 */

/**
 * List of ad network domains to check
 */
const AD_NETWORK_DOMAINS = [
  'googleadservices.com',
  'doubleclick.net',
  'googlesyndication.com'
] as const;

/**
 * Safely check if a hostname matches or is a subdomain of a target domain
 * This prevents false positives from substring matching (e.g., "evil-doubleclick.net.attacker.com")
 * @param hostname - The hostname to check
 * @param targetDomain - The domain to match against
 * @returns true if hostname is exactly targetDomain or a subdomain of it
 */
export function isHostnameMatch(hostname: string, targetDomain: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedTarget = targetDomain.toLowerCase();
  
  // Exact match
  if (normalizedHostname === normalizedTarget) {
    return true;
  }
  
  // Subdomain match - hostname must end with ".targetDomain"
  if (normalizedHostname.endsWith('.' + normalizedTarget)) {
    return true;
  }
  
  return false;
}

/**
 * Check if a URL's hostname matches any ad network domain
 * @param url - URL object or string to check
 * @returns true if the URL is from a known ad network
 */
export function isAdNetworkUrl(url: string | URL): boolean {
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    const hostname = urlObj.hostname;
    
    return AD_NETWORK_DOMAINS.some(domain => isHostnameMatch(hostname, domain));
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a YouTube pagead URL
 * @param url - URL to check
 * @returns true if URL is a YouTube pagead URL
 */
export function isYouTubePageadUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return isHostnameMatch(urlObj.hostname, 'youtube.com') && 
           urlObj.pathname.includes('/pagead');
  } catch {
    return false;
  }
}

/**
 * Extract destination URL from ad network redirect URL
 * @param url - The ad network URL
 * @returns The destination URL or null if not found
 */
export function extractDestinationUrl(url: string | URL): string | null {
  try {
    const urlObj = typeof url === 'string' ? new URL(url) : url;
    
    // Try common redirect parameters
    const destUrl = urlObj.searchParams.get('adurl') ||
                    urlObj.searchParams.get('url') ||
                    urlObj.searchParams.get('q');
    
    return destUrl;
  } catch {
    return null;
  }
}

/**
 * Remove tracking parameters from a URL
 * @param url - URL to clean
 * @returns Cleaned URL string
 */
export function removeTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const trackingParamsRegex = /^(utm_|fbclid|gclid|_ga|mc_)/i;
    
    const cleanParams = new URLSearchParams();
    for (const [key, value] of urlObj.searchParams) {
      if (!trackingParamsRegex.test(key)) {
        cleanParams.set(key, value);
      }
    }
    
    urlObj.search = cleanParams.toString();
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Clean and normalize a URL, extracting destination from ad redirects
 * @param url - URL to clean
 * @returns Cleaned URL or null if URL should be filtered out
 */
export function cleanUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // If it's an ad network URL, try to extract the destination
    if (isAdNetworkUrl(urlObj)) {
      const destUrl = extractDestinationUrl(urlObj);
      if (destUrl) {
        return cleanUrl(destUrl); // Recursively clean
      }
      return null; // No destination found, filter out
    }
    
    // Clean tracking parameters
    return removeTrackingParams(url);
  } catch {
    // Try to make a valid URL
    if (url.startsWith('http')) {
      return url;
    }
    return `https://${url}`;
  }
}
