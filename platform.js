
import path from 'path';
const isPosix = (path.sep === path.posix.sep);

const noop = (x) => x;

if (!isPosix && path.sep !== '\\') {
  throw new Error(`can't start, unknown path.sep: ${path.sep}`);
}

export const posixToPlatform = isPosix ? noop : (x) => x.replace(/\//g, '\\');
export const platformToPosix = isPosix ? noop : (x) => x.replace(/\\/g, '/');
