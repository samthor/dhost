
const fs = require('fs');
const listing = require('./listing.js');
const mime = require('mime');
const path = require('path');
const stream = require('stream');
const url = require('url');


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
 * @param {string} filename to call realpath on
 * @return {?string} realpath or null
 */
async function realpathOrNull(filename) {
  try {
    return fs.realpathSync(filename);
  } catch (err) {
    return null;
  }
}


/**
 * @param {string} filename to stat
 * @param {boolean} lstat whether to use lstat
 * @return {?fs.Stats} stats or null for unknown file
 */
async function statOrNull(filename, lstat=false) {
  try {
    if (lstat) {
      return fs.lstatSync(filename);
    }
    return fs.statSync(filename);
  } catch (err) {
    return null;
  }
}

/**
 * Builds middleware that serves static files from the specified path, or the
 * current directory by default.
 *
 * @param {{
 *   path: (string|undefined),
 *   cors: (boolean|undefined),
 *   serveLink: (boolean|undefined),
 * }} options
 */
function buildHandler(options) {
  options = Object.assign({
    path: '.',
    cors: false,
    serveLink: false,
    listing: true,
  }, options);

  const redirectToLink = !options.serveLink;
  const rootPath = path.resolve(options.path);

  // implicit headers
  const headers = {
    'Expires': '0',
    'Cache-Control': 'no-store',
  };
  if (options.cors) {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  const validPath = (cand) => {
    if (!cand.startsWith(rootPath)) {
      // ignore
    } else if (cand.length === rootPath.length || cand[rootPath.length] === path.sep) {
      return true;
    }
    return false;
  };

  return async (req, res, next) => {
    // send implicit never-cache headers
    for (const key in headers) {
      res.setHeader(key, headers[key]);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const pathname = decodeURI(url.parse(req.url).pathname);
    let filename = path.join(rootPath, '.', pathname);

    // nb. NodeJS' HTTP server seems to prevent abuse, but it's worth checking that filename is
    // within the root
    if (!validPath(filename)) {
      res.writeHead(403);
      return res.end();
    }

    // Ensure the requested path is actually real, otherwise redirect to it. This behavior is the
    // default and is 'costly' in that we must call readlink and do some checking.
    if (redirectToLink) {
      // trim trailing '/' as realpathSync won't return it
      let filenameToCheck = filename;
      const hasTrailingSep = filenameToCheck.endsWith(path.sep);
      if (hasTrailingSep) {
        filenameToCheck = filenameToCheck.substr(0, filenameToCheck.length - path.sep.length);
      }

      const real = await realpathOrNull(filenameToCheck);
      if (real === null) {
        return next();  // file doesn't exist, short-circuit (don't need to stat)
      } else if (real !== filenameToCheck) {
        if (!validPath(real)) {
          // can't escape via symlink
          res.writeHead(403);
          return res.end();
        }

        const absolute = '/' + path.relative(rootPath, real) + (hasTrailingSep ? '/' : '');
        res.writeHead(302, {'Location': absolute});
        return res.end();
      }
    }

    let stat = await statOrNull(filename);
    if (stat === null) {
      return next();  // file doesn't exist (also checked in realpath above)
    }

    let readStream = null;

    if (stat.isDirectory()) {
      // check for dir/index.html and serve that
      const cand = path.join(filename, 'index.html');
      const indexStat = await statOrNull(cand, redirectToLink);

      if (indexStat && !indexStat.isDirectory() && !indexStat.isSymbolicLink()) {
        // create stream for dir/index.html (not if dir or symlink)
        filename = cand;
        stat = indexStat;

      } else if (!filename.endsWith('/')) {
        // directory listings must end with /
        const dir = path.basename(filename);
        res.writeHead(302, {'Location': dir + '/'});
        return res.end();

      } else if (options.listing) {
        // list contents into simple HTML
        const raw = await listing(filename, pathname);
        const buffer = Buffer.from(raw, 'utf-8');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Type', 'text/html');
        readStream = await createStringReadStream(buffer);
        stat = null;

      } else {
        return next();
      }
    }

    // real file, tell the client about it
    if (stat) {
      res.setHeader('Content-Length', stat.size);
      const contentType = mime.getType(filename);
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
    }

    // don't create a readable stream, bail early (used for CORS)
    if (req.method === 'HEAD') {
      res.writeHead(200);
      return res.end();
    }

    if (readStream === null) {
      readStream = fs.createReadStream(filename);
    }

    readStream.on('open', () => res.writeHead(200));
    readStream.pipe(res);

    return new Promise((resolve, reject) => {
      readStream.on('end', resolve);
      readStream.on('error', reject);
    });
  };
};

module.exports = buildHandler;
