/**
 * Token Bucket / Sliding Window In-Memory Rate Limiter for sqlite2pg API & Batch Insertion
 */

export interface RateLimiterOptions {
  windowMs?: number; // Time window in milliseconds (default: 60,000ms = 1 minute)
  maxRequests?: number; // Max requests allowed per window per key (default: 60)
}

export interface RateLimitStatus {
  allowed: boolean;
  totalLimit: number;
  remaining: number;
  resetTime: number; // Unix epoch ms when the window resets
  retryAfterSeconds?: number;
}

export class RateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private hits: Map<string, { count: number; resetTime: number }>;
  private cleanupInterval: NodeJS.Timeout;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs || 60_000;
    this.maxRequests = options.maxRequests || 60;
    this.hits = new Map();

    // Periodic cleanup of expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.hits.entries()) {
        if (now >= record.resetTime) {
          this.hits.delete(key);
        }
      }
    }, 30_000);

    // Unref so it doesn't prevent Node process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Checks rate limit for an identifier (IP address or API key).
   */
  public check(identifier: string): RateLimitStatus {
    const now = Date.now();
    let record = this.hits.get(identifier);

    if (!record || now >= record.resetTime) {
      record = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.hits.set(identifier, record);
      return {
        allowed: true,
        totalLimit: this.maxRequests,
        remaining: this.maxRequests - 1,
        resetTime: record.resetTime,
      };
    }

    if (record.count < this.maxRequests) {
      record.count++;
      return {
        allowed: true,
        totalLimit: this.maxRequests,
        remaining: this.maxRequests - record.count,
        resetTime: record.resetTime,
      };
    }

    // Rate limit exceeded
    const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    return {
      allowed: false,
      totalLimit: this.maxRequests,
      remaining: 0,
      resetTime: record.resetTime,
      retryAfterSeconds,
    };
  }

  /**
   * Resets rate limits for a given key.
   */
  public reset(identifier: string): void {
    this.hits.delete(identifier);
  }

  /**
   * Destroys cleanup timers.
   */
  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.hits.clear();
  }
}

/**
 * Throttle helper to pause execution between migration batches
 */
export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
