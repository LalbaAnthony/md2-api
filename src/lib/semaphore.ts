import { overloadedError } from "../errors.ts";
import { UNDER_PRESSURE_RETRY_AFTER_SECONDS } from "../constants.ts";
import type { Semaphore, SemaphoreOptions, SemaphoreRelease } from "../types/concurrency.ts";

export const createSemaphore = (options: SemaphoreOptions): Semaphore => {
  const waiting: ((release: SemaphoreRelease) => void)[] = [];
  let available = options.permits;

  const release = (): void => {
    const next = waiting.shift();
    if (next === undefined) {
      available += 1;
      return;
    }
    next(release);
  };

  return {
    get inFlight() {
      return options.permits - available;
    },
    get queued() {
      return waiting.length;
    },
    acquire: async () => {
      if (available > 0) {
        available -= 1;
        return release;
      }
      if (waiting.length >= options.maximumQueueLength) {
        throw overloadedError(UNDER_PRESSURE_RETRY_AFTER_SECONDS);
      }
      return new Promise<SemaphoreRelease>((resolve) => {
        waiting.push(resolve);
      });
    },
  };
};
