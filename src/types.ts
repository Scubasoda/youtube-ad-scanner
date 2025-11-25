/**
 * Detection result with confidence scoring
 */
export interface DetectionResult {
  element: HTMLElement;
  type: AdType;
  confidence: number; // 0-1 score
  evidence: string[]; // array of detection signals
  timestamp: number;
}

/**
 * Types of ads that can be detected
 */
export type AdType = 'preroll' | 'midroll' | 'banner' | 'sponsored' | 'overlay' | 'display-ad' | 'video-ad' | 'network-ad';

/**
 * Ad segment timing information
 */
export interface AdSegment {
  startTime: number;
  endTime?: number;
  detectedAt: number;
  skipTriggered?: boolean;
}

/**
 * Ad information to be logged
 */
export interface AdInfo {
  url: string;
  type: AdType | string;
  source: string;
  confidence?: number;
  evidence?: string[];
}

/**
 * Log entry for storage
 */
export interface AdLogEntry {
  timestamp: number;
  destinationUrl: string;
  adType: string;
  source: string;
  confidence?: number;
  evidence?: string[];
  videoId: string;
}

/**
 * Selector configuration for ad detection
 */
export interface SelectorConfig {
  selector: string;
  priority: number;
  successRate: number;
  lastSuccess?: number;
  failureCount: number;
}

/**
 * Detection step result
 */
export interface StepResult {
  detected: boolean;
  confidence: number;
  evidence: string[];
  ads?: DetectionResult[];
}

/**
 * Message types for extension communication
 */
export interface ExtensionMessage {
  action: string;
  adInfo?: AdInfo;
  timestamp?: number;
}

/**
 * Telemetry data (privacy-preserving)
 */
export interface TelemetryData {
  selectorSuccessRates: Record<string, number>;
  timeToDetect: number[];
  youtubeVersion?: string;
  timestamp: number;
}
