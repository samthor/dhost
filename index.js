
const fs = require('fs');
const helper = require('./helper.js');
const listing = require('./listing.js');
const platform = require('./platform.js');
const mime = require('mime');
const path = require('path');
const url = require('url');


function redirect(res, to) {
  res.writeHead(302, {'Location': to});
  return res.end();
}


/**
 * Builds middleware that serves static files from the specified path, or the
 * current directory by default.
 *
 * @param {{
 *   path: (string|undefined),
 *   cors: (boolean|undefined),
 *   serveLink: (boolean|undefined),
 *   listing: (boolean|undefined),
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
  const rootPath = path.resolve(options.path);  // resolves symlinks

  // implicit headers
  const headers = {
    'Expires': '0',
    'Cache-Control': 'no-store',
  };
  if (options.cors) {
    headers['Access-Control-Allow-Origin'] = '*';
  }

  return async (req, res, next) => {
    // send implicit never-cache headers
    for (const key in headers) {
      res.setHeader(key, headers[key]);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const pathname = decodeURI(url.parse(req.url).pathname);
    if (!pathname.startsWith('/')) {  // node should prevent this, but sanity-check anyway
      res.writeHead(400);
      return res.end();
    }

    // Call normalize on the absolute pathname (e.g. "/../../foo" => "/foo"), to prevent abuse.
    const normalized = path.posix.normalize(pathname);
    if (pathname !== normalized) {
      return redirect(res, normalized);
    }
    let filename = path.join(rootPath, '.', platform.posixToPlatform(pathname));

    // Ensure the requested path is actually real, otherwise redirect to it. This behavior is the
    // default and is 'costly' in that we must call readlink a bunch and do some checks.
    if (redirectToLink) {
      const real = await helper.realpathIn(rootPath, pathname);
      if (real === null) {
        // can't escape via symlink
        res.writeHead(403);
        return res.end();
      }
      if (real !== filename) {
        const hasTrailingSep = pathname.endsWith('/');
        const rel = platform.platformToPosix(path.relative(rootPath, real));
        const absolute = '/' + rel + (hasTrailingSep ? '/' : '');
        return redirect(res, absolute);
      }
    }

    let stat = await helper.statOrNull(filename);
    if (stat === null) {
      return next();  // file doesn't exist
    }

    let readStream = null;

    if (stat.isDirectory()) {
      // check for dir/index.html and serve that
      const cand = path.join(filename, 'index.html');
      const indexStat = await helper.statOrNull(cand, redirectToLink);

      if (indexStat && !indexStat.isDirectory() && !indexStat.isSymbolicLink()) {
        // create stream for dir/index.html (not if dir or symlink)
        filename = cand;
        stat = indexStat;

      } else if (!pathname.endsWith('/')) {
        // directory listings must end with /
        const dir = path.posix.basename(pathname);
        return redirect(res, `${dir}/`);

      } else if (options.listing) {
        // list contents into simple HTML
        const raw = await listing(filename, pathname);
        const buffer = Buffer.from(raw, 'utf-8');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        readStream = await helper.createStringReadStream(buffer);
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
        let extra = '';
        if (contentType.startsWith('text/')) {
          extra = '; charset=utf-8'
        }
        res.setHeader('Content-Type', contentType + extra);
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
