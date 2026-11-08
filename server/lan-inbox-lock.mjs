import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

function processStart(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1_000, env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
    }).trim();
  } catch { return ''; }
}

let ownStart;

function removeOwner(lock, owner) {
  try { unlinkSync(join(lock, owner)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  try { rmdirSync(lock); }
  catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; }
}

function reapDeadOwner(lock) {
  let owner;
  try { [owner] = readdirSync(lock); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const match = /^(\d+)-[a-f0-9-]{36}$/.exec(owner ?? '');
  if (!match) return;
  const pid = Number(match[1]);
  try {
    process.kill(pid, 0);
  } catch (error) {
    if (error.code === 'ESRCH') removeOwner(lock, owner);
    else if (error.code !== 'EPERM') throw error;
    return;
  }
  if (pid === process.pid) return;
  let start;
  try { start = readFileSync(join(lock, owner), 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const currentStart = start && processStart(pid);
  if (currentStart && currentStart !== start) removeOwner(lock, owner);
}

export async function withLanInboxLock(file, transaction) {
  const directory = dirname(file);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = join(realpathSync(directory), `${basename(file)}.lock`);
  const candidate = mkdtempSync(`${lock}.`);
  const owner = `${process.pid}-${randomUUID()}`;
  let acquired = false;
  try {
    ownStart ??= processStart(process.pid);
    writeFileSync(join(candidate, owner), ownStart, { mode: 0o600 });
    const deadline = performance.now() + 4_000;
    while (!acquired) {
      try {
        // An occupied directory cannot be replaced. Install the unique owner atomically with the lock.
        renameSync(candidate, lock);
        acquired = true;
      } catch (error) {
        if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
        reapDeadOwner(lock);
        if (performance.now() >= deadline) throw new Error('Order inbox is busy');
        await setTimeout(15);
      }
    }
    // The callback must be synchronous so it finishes before the lock is released.
    return transaction();
  } finally {
    // Only this unique owner can be unlinked. A different writer's populated directory survives.
    if (acquired) removeOwner(lock, owner);
    else rmSync(candidate, { recursive: true, force: true });
  }
}
