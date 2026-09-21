import { describe, expect, it } from "vitest";
import { createSemaphore } from "../../src/lib/semaphore.ts";
import { createLruCache } from "../../src/lib/cache.ts";
import { isAppError } from "../../src/errors.ts";

describe("the semaphore", () => {
  it("admits up to its permit count without waiting", async () => {
    const semaphore = createSemaphore({ permits: 2, maximumQueueLength: 4 });
    const first = await semaphore.acquire();
    const second = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(2);
    expect(semaphore.queued).toBe(0);
    first();
    second();
  });

  it("queues beyond the permit count and releases in order", async () => {
    const semaphore = createSemaphore({ permits: 1, maximumQueueLength: 4 });
    const order: number[] = [];
    const first = await semaphore.acquire();
    const secondPending = semaphore.acquire().then((release) => {
      order.push(2);
      release();
    });
    expect(semaphore.queued).toBe(1);
    order.push(1);
    first();
    await secondPending;
    expect(order).toEqual([1, 2]);
  });

  it("rejects with an overload once the queue is full", async () => {
    const semaphore = createSemaphore({ permits: 1, maximumQueueLength: 1 });
    const held = await semaphore.acquire();
    const queued = semaphore.acquire();
    try {
      await semaphore.acquire();
      expect.unreachable("Expected an overload error.");
    } catch (thrown) {
      expect(isAppError(thrown)).toBe(true);
      if (isAppError(thrown)) {
        expect(thrown.code).toBe("OVERLOADED");
        expect(thrown.statusCode).toBe(503);
      }
    }
    held();
    (await queued)();
  });

  it("returns a permit to the pool when nothing is waiting", async () => {
    const semaphore = createSemaphore({ permits: 1, maximumQueueLength: 1 });
    const release = await semaphore.acquire();
    release();
    expect(semaphore.inFlight).toBe(0);
    const again = await semaphore.acquire();
    expect(semaphore.inFlight).toBe(1);
    again();
  });
});

describe("the compiled theme cache", () => {
  it("returns null for an absent key", () => {
    const cache = createLruCache<string>(2);
    expect(cache.get("absent")).toBeNull();
  });

  it("stores and returns a value", () => {
    const cache = createLruCache<string>(2);
    cache.set("a", "first");
    expect(cache.get("a")).toBe("first");
    expect(cache.size).toBe(1);
  });

  it("evicts the least recently used entry", () => {
    const cache = createLruCache<string>(2);
    cache.set("a", "first");
    cache.set("b", "second");
    cache.set("c", "third");
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBe("second");
    expect(cache.get("c")).toBe("third");
  });

  it("counts a read as a use", () => {
    const cache = createLruCache<string>(2);
    cache.set("a", "first");
    cache.set("b", "second");
    cache.get("a");
    cache.set("c", "third");
    expect(cache.get("a")).toBe("first");
    expect(cache.get("b")).toBeNull();
  });

  it("replaces a value without growing", () => {
    const cache = createLruCache<string>(2);
    cache.set("a", "first");
    cache.set("a", "again");
    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe("again");
  });

  it("deletes by predicate and reports the count", () => {
    const cache = createLruCache<string>(4);
    cache.set("default@one", "x");
    cache.set("default@two", "y");
    cache.set("other@one", "z");
    expect(cache.deleteWhere((key) => key.startsWith("default@"))).toBe(2);
    expect(cache.size).toBe(1);
    expect(cache.get("other@one")).toBe("z");
  });

  it("clears every entry", () => {
    const cache = createLruCache<string>(4);
    cache.set("a", "first");
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
