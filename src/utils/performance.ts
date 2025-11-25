/**
 * Performance utilities for throttling and debouncing operations
 */

/**
 * Creates a debounced version of a function
 * @param func - Function to debounce
 * @param wait - Milliseconds to wait
 * @returns Debounced function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: unknown, ...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Creates a throttled version of a function
 * @param func - Function to throttle
 * @param limit - Milliseconds between calls
 * @returns Throttled function
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;
  
  return function(this: unknown, ...args: Parameters<T>): void {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
        if (lastArgs !== null) {
          func.apply(this, lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}

/**
 * Batch operations to reduce DOM thrashing
 */
export class BatchOperations {
  private pendingReads: Array<() => void> = [];
  private pendingWrites: Array<() => void> = [];
  private scheduled = false;

  /**
   * Queue a read operation
   */
  read(fn: () => void): void {
    this.pendingReads.push(fn);
    this.scheduleFlush();
  }

  /**
   * Queue a write operation
   */
  write(fn: () => void): void {
    this.pendingWrites.push(fn);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    // Execute all reads first
    const reads = this.pendingReads;
    this.pendingReads = [];
    reads.forEach(fn => fn());

    // Then all writes
    const writes = this.pendingWrites;
    this.pendingWrites = [];
    writes.forEach(fn => fn());

    this.scheduled = false;
  }
}

/**
 * Performance measurement utilities
 */
export class PerformanceTracker {
  private measurements: Map<string, number[]> = new Map();

  /**
   * Start a measurement
   */
  start(label: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.record(label, duration);
    };
  }

  /**
   * Record a measurement
   */
  record(label: string, value: number): void {
    const values = this.measurements.get(label) || [];
    values.push(value);
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
    this.measurements.set(label, values);
  }

  /**
   * Get average for a label
   */
  getAverage(label: string): number {
    const values = this.measurements.get(label);
    if (!values || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Get all statistics
   */
  getStats(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    this.measurements.forEach((values, label) => {
      if (values.length > 0) {
        stats[label] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        };
      }
    });
    return stats;
  }
}

// Global performance tracker instance
export const performanceTracker = new PerformanceTracker();
