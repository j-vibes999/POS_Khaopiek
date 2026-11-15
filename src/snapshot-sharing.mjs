// Snapshots contain arrays, plain objects and scalar values. Retain unchanged
// branches so polling does not commit another render for identical server data.
export function shareSnapshot(previous, next) {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object'
    || Array.isArray(previous) !== Array.isArray(next)) return next;
  const keys = Object.keys(next);
  let equal = Object.keys(previous).length === keys.length;
  const shared = Array.isArray(next) ? [...next] : { ...next };
  for (const key of keys) {
    shared[key] = shareSnapshot(previous[key], next[key]);
    if (!Object.hasOwn(previous, key) || !Object.is(shared[key], previous[key])) equal = false;
  }
  return equal ? previous : shared;
}
