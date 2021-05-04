
import * as stream from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as platform from './platform.js';


/**
 * @param {string} filename to read
 * @return {Promise<string|null>} link value of filename, or null for nonexistent/invalid
 */
function readlinkOrNull(filename) {
  return new Promise((r) => {
    fs.readlink(filename, (err, value) => r(err ? null : value));
  });
}


/**
 * As per `fs.realpath`, but only operates on the last segment of the filename.
 *
 * @param {string} filename to resolve
 * @return {Promise<string>} resolved filename
 */
async function reallink(filename) {
  let curr = filename;

  for (;;) {
    const link = await readlinkOrNull(curr);
    if (link === null) {
      return curr;
    } else if (path.isAbsolute(link)) {
      curr = link;
    } else {
      curr = path.join(path.dirname(curr), path.sep, link);
    }
  }
}


/**
 * @param {stream.Writable} w
 * @param {Buffer} buffer
 */
export async function asyncWrite(w, buffer) {
  /** @type {Promise<void>} */
  const p = new Promise((resolve, reject) => {
    w.write(buffer, (err) => err ? reject(err) : resolve());
  });
  return p;
}


/**
 * @param {string} filename
 * @return {string[]} parts of filename
 */
function splitPath(filename) {
  const parts = [];
  while (filename.length) {
    const parsed = path.parse(filename);
    if (filename === parsed.dir) {
      parts.unshift('');  // this was an absolute path like "/foo" => ["", "foo"]
      break;
    }
    filename = parsed.dir;
    parts.unshift(parsed.base);
  }
  return parts;
}


/**
 * @param {string|Buffer} raw string to push into readable stream
 * @return {stream.Readable} stream of string
 */
export function createStringReadStream(raw) {
  const r = new stream.Readable({
    read() {
      r.push(raw);
      r.push(null);
    },
  });
  return r;
}


/**
 * @param {string} root where results are valid within
 * @param {string} pathname within root, as per HTTP request
 * @return {Promise<string?>} resolved real path or null for invalid symlink
 */
export async function realpathIn(root, pathname) {
  const hasTrailingSep = pathname.endsWith(path.sep);
  const parts = splitPath(platform.posixToPlatform(path.posix.normalize(pathname)));

  let curr = root;
  for (const part of parts) {
    if (!part.length) {
      continue;
    }

    const test = path.join(curr, path.sep, part);
    curr = await reallink(test);

    // If the path was modified, then a symlink was resolved. Check if it's still valid.
    if (curr !== test && !pathInRoot(root, curr)) {
      return null;
    }

    // TODO(samthor): This could be a real file, or a missing file. Check for missing file and
    // complete fast/early in this case.
  }

  return path.join(curr, hasTrailingSep ? path.sep : '');
}


/**
 * @param {string} filename to stat
 * @param {boolean} lstat whether to use lstat
 * @return {Promise<fs.Stats?>} stats or null for unknown file
 */
export async function statOrNull(filename, lstat=false) {
  const method = lstat ? fs.lstat : fs.stat;
  return await new Promise((r) => {
    method(filename, (err, stats) => r(err ? null : stats));
  });
}


/**
 * Checks whether the given path is within (inclusive) the root path.
 *
 * @param {string} root path to check within
 * @param {string} cand full candidate path
 * @return {boolean}
 */
function pathInRoot(root, cand) {
  while (root.endsWith(path.sep)) {
    root = root.slice(0, -path.sep.length);
  }

  if (!cand.startsWith(root)) {
    return false;
  }
  const check = cand.substr(root.length, path.sep.length);
  return check.length === 0 || check === path.sep;
}

