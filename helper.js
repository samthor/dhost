
const stream = require('stream');
const fs = require('fs');
const path = require('path');


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
 * @param {*} filename 
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


async function realpathIn(root, pathname) {
  const hasTrailingSep = pathname.endsWith(path.sep);
  const parts = splitPath(path.normalize(pathname));

  let combined = root;
  let absoluteFrom = -1;
  let resolvedParts = await Promise.all(parts.map(async (part, i) => {
    console.info(`checking part "${part}"`);
    if (part.length) {
      combined = path.join(combined, path.sep, part);
      const link = await readlinkOrNull(combined);
      if (link !== null) {
        console.info('got link', link);
        if (path.isAbsolute(link)) {
          absoluteFrom = Math.max(absoluteFrom, i);
        }
        return link;
      }
    }
    return part;
  }));

  let output = root;

  if (absoluteFrom >= 0) {
    output = resolvedParts[absoluteFrom];
    resolvedParts = resolvedParts.slice(absoluteFrom + 1);
  }

  resolvedParts.forEach((part) => {
    if (part.length) {
      output = path.join(output, path.sep, part);
    }
    console.info('step', output, part);
  });

  return output + (hasTrailingSep ? path.sep : '');
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
  createStringReadStream,
  pathInRoot,
  realpathIn,
  statOrNull,
};
