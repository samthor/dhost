
import * as types from '../types/index.js';
import * as http from 'http';


/**
 * @param {http.ServerResponse} res
 * @param {string} to
 */
export function redirect(res, to) {
  res.writeHead(302, {'Location': to});
  return res.end();
}


/**
 * @param {string} rangeHeader
 * @param {number} knownSize
 * @return {{start: number, end: number}=}
 */
export function parseRange(rangeHeader, knownSize) {
  const ranges = rangeHeader.split(/,\s+/g);
  if (ranges.length !== 1) {
    return;
  }

  const singleRange = ranges[0];
  if (!singleRange.startsWith('bytes=')) {
    return;
  }
  const actualRange = singleRange.substr('bytes='.length);
  const parts = actualRange.split('-');
  if (parts.length !== 2) {
    return;
  }
  const numericParts = parts.map((part) => +part || 0);

  // nb. Both part values are non-negative, because we split on "-".

  let start = 0;
  let end = knownSize;

  // e.g. "range=-500", return last 500 bytes
  if (parts[1] && !parts[0]) {
    start = Math.max(0, knownSize - numericParts[1]);
  } else if (parts[0] && !parts[1]) {
    start = Math.min(numericParts[0], knownSize);
  } else {
    // nb. end is inclusive (for some reason)
    start = Math.min(numericParts[0], knownSize);
    end = Math.min(numericParts[1] + 1, knownSize);
  }

  if (start > end) {
    return;
  }
  return {start, end}
}


/**
 * Returns the request path as a relative path, dealing with nuances while being served under a
 * different host (c.f. originalUrl). This will always return a string that begins with '.'.
 *
 * @param {types.IncomingMessage} req
 * @return {string}
 */
export function relativePath(req) {
  const pathname = decodeURI(req.url || '/');
  if (!pathname || (pathname === '/' && req.originalUrl && !req.originalUrl.endsWith('/'))) {
    // Polka (and others) give us "/" even though the originalUrl might be "/foo". Return a single
    // relative dot so that we can know that we weren't properly terminated with "/".
    return '.';
  }
  return '.' + pathname;
}