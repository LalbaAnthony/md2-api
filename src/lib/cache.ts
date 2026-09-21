import type { LruCache } from "../types/cache.ts";

export const createLruCache = <TValue>(capacity: number): LruCache<TValue> => {
  const entries = new Map<string, TValue>();

  return {
    get size() {
      return entries.size;
    },
    get: (key) => {
      const value = entries.get(key);
      if (value === undefined) {
        return null;
      }
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set: (key, value) => {
      if (entries.has(key)) {
        entries.delete(key);
      }
      entries.set(key, value);
      while (entries.size > capacity) {
        const oldest = entries.keys().next();
        if (oldest.done === true) {
          break;
        }
        entries.delete(oldest.value);
      }
    },
    deleteWhere: (predicate) => {
      let removed = 0;
      for (const key of [...entries.keys()]) {
        if (predicate(key)) {
          entries.delete(key);
          removed += 1;
        }
      }
      return removed;
    },
    clear: () => {
      entries.clear();
    },
  };
};
