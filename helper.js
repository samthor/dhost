
const stream = require('stream');
const fs = require('fs');
const path = require('path');
const platform = require('./platform.js');


/**
 * @param {string} filename to read
 * @return {!Buffer}
 */
function read(filename) {
  return new Promise((resolve, reject) => {
    fs.readFile(filename, (err, buffer) => {
      err ? reject(err) : resolve(buffer);
    });
  });
}


/**
 * @param {string} filename to read
 * @return {?string} link value of filename, or null for nonexistent/invalid
 */
function readlinkOrNull(filename) {
  return new Promise((r) => {
    fs.readlink(filename, (err, value) => r(err ? null : value));
  })
};


/**
 * As per `fs.realpath`, but only operates on the last segment of the filename.
 *
 * @param {string} filename to resolve
 * @return {string} resolved filename
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
 * @param {string} filename
 * @return {!Array<string>} parts of 
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
};


/**
 * @param {string} raw string to push into readable stream
 * @return {!stream.Readable} stream of string
 */
function createStringReadStream(raw) {
  const r = new stream.Readable();
  r.push(raw);
  r.push(null);
  return r;
}


/**
 * @param {string} root where results are valid within
 * @param {string} pathname within root, as per HTTP request
 */
async function realpathIn(root, pathname) {
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
 * @return {?fs.Stats} stats or null for unknown file
 */
async function statOrNull(filename, lstat=false) {
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


module.exports = {
  read,
  createStringReadStream,
  realpathIn,
  statOrNull,
};
