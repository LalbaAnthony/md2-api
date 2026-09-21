export interface LruCache<TValue> {
  get(key: string): TValue | null;
  set(key: string, value: TValue): void;
  deleteWhere(predicate: (key: string) => boolean): number;
  clear(): void;
  readonly size: number;
}
