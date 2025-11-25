/**
 * YouTube Player API integration
 */

/**
 * Extended YouTube player interface
 */
interface YouTubePlayer extends HTMLElement {
  getAdState?: () => number;
  getPlayerState?: () => number;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getVideoData?: () => { video_id?: string; title?: string };
  playVideo?: () => void;
  pauseVideo?: () => void;
}

/**
 * Ad state enum from YouTube API
 */
export enum AdState {
  NONE = -1,
  PLAYING = 1,
  PAUSED = 2,
  ENDED = 3
}

/**
 * Player state enum from YouTube API
 */
export enum PlayerState {
  UNSTARTED = -1,
  ENDED = 0,
  PLAYING = 1,
  PAUSED = 2,
  BUFFERING = 3,
  CUED = 5
}

/**
 * YouTubePlayerAPI - Wrapper for YouTube player interactions
 */
export class YouTubePlayerAPI {
  private player: YouTubePlayer | null = null;

  /**
   * Find the YouTube player element
   */
  findPlayer(): YouTubePlayer | null {
    if (this.player && document.contains(this.player)) {
      return this.player;
    }
    
    this.player = document.querySelector('.html5-video-player') as YouTubePlayer | null;
    return this.player;
  }

  /**
   * Check if an ad is currently playing
   */
  isAdPlaying(): boolean {
    const player = this.findPlayer();
    if (!player) return false;

    try {
      // Check player classes first (most reliable)
      if (player.classList.contains('ad-showing') || 
          player.classList.contains('ad-interrupting')) {
        return true;
      }

      // Try API method
      if (typeof player.getAdState === 'function') {
        const adState = player.getAdState();
        return adState === AdState.PLAYING;
      }
    } catch {
      // API not available or error
    }

    return false;
  }

  /**
   * Get current ad state
   */
  getAdState(): AdState {
    const player = this.findPlayer();
    if (!player) return AdState.NONE;

    try {
      if (typeof player.getAdState === 'function') {
        return player.getAdState();
      }
    } catch {
      // API not available
    }

    // Fallback to class-based detection
    if (player.classList.contains('ad-showing')) {
      return AdState.PLAYING;
    }

    return AdState.NONE;
  }

  /**
   * Get current player state
   */
  getPlayerState(): PlayerState {
    const player = this.findPlayer();
    if (!player) return PlayerState.UNSTARTED;

    try {
      if (typeof player.getPlayerState === 'function') {
        return player.getPlayerState();
      }
    } catch {
      // API not available
    }

    return PlayerState.UNSTARTED;
  }

  /**
   * Get current video time
   */
  getCurrentTime(): number {
    const player = this.findPlayer();
    if (!player) return 0;

    try {
      if (typeof player.getCurrentTime === 'function') {
        return player.getCurrentTime();
      }
    } catch {
      // API not available
    }

    // Fallback to video element
    const video = player.querySelector('video');
    return video?.currentTime || 0;
  }

  /**
   * Get video duration
   */
  getDuration(): number {
    const player = this.findPlayer();
    if (!player) return 0;

    try {
      if (typeof player.getDuration === 'function') {
        return player.getDuration();
      }
    } catch {
      // API not available
    }

    // Fallback to video element
    const video = player.querySelector('video');
    return video?.duration || 0;
  }

  /**
   * Get current video ID
   */
  getVideoId(): string | null {
    const player = this.findPlayer();
    if (!player) return null;

    try {
      if (typeof player.getVideoData === 'function') {
        const data = player.getVideoData();
        return data?.video_id || null;
      }
    } catch {
      // API not available
    }

    // Fallback to URL parsing
    const url = new URL(window.location.href);
    return url.searchParams.get('v');
  }

  /**
   * Check if video player is visible
   */
  isPlayerVisible(): boolean {
    const player = this.findPlayer();
    if (!player) return false;

    const rect = player.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Get ad-related evidence from player state
   */
  getAdEvidence(): string[] {
    const evidence: string[] = [];
    const player = this.findPlayer();
    
    if (!player) return evidence;

    // Check player classes
    if (player.classList.contains('ad-showing')) {
      evidence.push('player-class:ad-showing');
    }
    if (player.classList.contains('ad-interrupting')) {
      evidence.push('player-class:ad-interrupting');
    }

    // Check API state
    const adState = this.getAdState();
    if (adState === AdState.PLAYING) {
      evidence.push('api:getAdState=1');
    }

    // Check video position for preroll vs midroll
    const currentTime = this.getCurrentTime();
    if (adState === AdState.PLAYING && evidence.length > 0) {
      if (currentTime < 1) {
        evidence.push('timing:preroll');
      } else {
        evidence.push('timing:midroll');
      }
    }

    return evidence;
  }
}

// Export singleton instance
export const youtubePlayerAPI = new YouTubePlayerAPI();
