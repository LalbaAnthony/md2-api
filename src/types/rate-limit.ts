export interface RateLimitPolicy {
  readonly max: number;
  readonly windowMs: number;
}
