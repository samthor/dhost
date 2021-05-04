
import * as path from 'path';
const isPosix = (path.sep === path.posix.sep);

/**
 * @template T
 * @param {T} x
 * @return {T}
 */
const noop = (x) => x;

if (!isPosix && path.sep !== '\\') {
  throw new Error(`can't start, unknown path.sep: ${path.sep}`);
}

/** @type {(x: string) => string} */
export const posixToPlatform = isPosix ? noop : (x) => x.replace(/\//g, '\\');

/** @type {(x: string) => string} */
export const platformToPosix = isPosix ? noop : (x) => x.replace(/\\/g, '/');
