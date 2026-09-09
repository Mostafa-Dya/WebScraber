// One in-process async mutex for every admin write (docs/ADMIN_SPEC.md §3.4): exact on the single
// long-lived process (ADR D2) and it keeps the admin far below the 60 writes/min/user quota.

export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();
  private waiting = 0;

  /** Runs `fn` after every previously queued call has settled; errors propagate, the queue continues. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prior = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.waiting += 1;
    try {
      await prior;
      return await fn();
    } finally {
      this.waiting -= 1;
      release();
    }
  }

  /** Calls queued or running. */
  get pending(): number {
    return this.waiting;
  }
}

export const adminLock = new AsyncMutex();

export function withAdminLock<T>(fn: () => Promise<T>): Promise<T> {
  return adminLock.run(fn);
}
