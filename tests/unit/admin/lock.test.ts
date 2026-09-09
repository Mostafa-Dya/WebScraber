import { describe, expect, it } from 'vitest';
import { AsyncMutex, adminLock, withAdminLock } from '../../../src/lib/admin/lock.ts';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

describe('AsyncMutex (ADMIN_SPEC §3.4)', () => {
  it('serialises overlapping callers in order and keeps going after a failure', async () => {
    const m = new AsyncMutex();
    const log: string[] = [];
    const a = m.run(async () => {
      log.push('a:start');
      await tick();
      log.push('a:end');
      return 'A';
    });
    const b = m.run(async () => {
      log.push('b:start');
      throw new Error('boom');
    });
    const c = m.run(async () => {
      log.push('c:start');
      return 'C';
    });
    expect(m.pending).toBe(3);
    await expect(a).resolves.toBe('A');
    await expect(b).rejects.toThrow('boom');
    await expect(c).resolves.toBe('C');
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'c:start']);
    expect(m.pending).toBe(0);
  });
  it('withAdminLock uses the shared instance', async () => {
    let inside = 0;
    let max = 0;
    const work = () =>
      withAdminLock(async () => {
        inside++;
        max = Math.max(max, inside);
        await tick();
        inside--;
      });
    await Promise.all([work(), work(), work()]);
    expect(max).toBe(1);
    expect(adminLock.pending).toBe(0);
  });
});
