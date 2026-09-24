import { describe, expect, it } from "vitest";
import { retryAfterSecondsOf } from "../../src/lib/rate-limit.ts";

describe("retry delay", () => {
  it.each([
    [60_000, 60],
    [1_001, 2],
    [1_000, 1],
    [1, 1],
    [0, 1],
  ])("rounds %d ms up to %d s", (ttlMs, seconds) => {
    expect(retryAfterSecondsOf(ttlMs)).toBe(seconds);
  });
});
