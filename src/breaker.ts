export type BreakerState = "closed" | "open" | "half-open";

export type BreakerOptions = {
  /** Consecutive failures that open the circuit. Default 5. */
  failureThreshold?: number;
  /** How long the circuit stays open, in milliseconds. Default 10_000. */
  resetMs?: number;
  /** Injectable clock. Default `Date.now`. */
  now?: () => number;
};

export class CircuitOpenError extends Error {
  constructor() {
    super("circuit is open");
    this.name = "CircuitOpenError";
  }
}

/**
 * Closed: calls go through. Enough consecutive failures open the circuit.
 * Open: calls fail fast until `resetMs` has passed.
 * Half-open: one probe is allowed. Success closes. Failure opens again.
 */
export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetMs: number;
  private readonly now: () => number;
  private failures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  private current: BreakerState = "closed";

  constructor(options: BreakerOptions = {}) {
    const failureThreshold = options.failureThreshold ?? 5;
    const resetMs = options.resetMs ?? 10_000;
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1) {
      throw new Error("failureThreshold must be an integer >= 1");
    }
    if (!Number.isFinite(resetMs) || resetMs < 0) {
      throw new Error("resetMs must be >= 0");
    }
    this.failureThreshold = failureThreshold;
    this.resetMs = resetMs;
    this.now = options.now ?? Date.now;
  }

  get state(): BreakerState {
    return this.current;
  }

  async execute<T>(task: () => Promise<T> | T): Promise<T> {
    this.promote();
    if (this.current === "open") throw new CircuitOpenError();
    const probing = this.current === "half-open";
    if (probing) {
      if (this.probeInFlight) throw new CircuitOpenError();
      this.probeInFlight = true;
    }
    try {
      const value = await task();
      this.succeed();
      return value;
    } catch (error) {
      this.fail();
      throw error;
    } finally {
      if (probing) this.probeInFlight = false;
    }
  }

  private promote() {
    if (this.current === "open" && this.now() >= this.openedAt + this.resetMs) {
      this.current = "half-open";
    }
  }

  private succeed() {
    this.failures = 0;
    this.current = "closed";
  }

  private fail() {
    if (this.current === "half-open") {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.trip();
  }

  private trip() {
    this.current = "open";
    this.openedAt = this.now();
    this.failures = 0;
  }
}
