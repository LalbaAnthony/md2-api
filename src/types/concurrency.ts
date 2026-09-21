export type SemaphoreRelease = () => void;

export interface Semaphore {
  acquire(): Promise<SemaphoreRelease>;
  readonly inFlight: number;
  readonly queued: number;
}

export interface SemaphoreOptions {
  readonly permits: number;
  readonly maximumQueueLength: number;
}
