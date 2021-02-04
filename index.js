
import * as fs from 'fs';
import * as helper from './helper.js';
import listing from './listing.js';
import * as platform from './platform.js';
import mime from 'mime';
import * as path from 'path';
import * as http from 'http';
import buildModuleRewriter from 'gumnut/imports';
import * as types from './types/index.js';
import * as stream from 'stream';


function redirect(res, to) {
  res.writeHead(302, {'Location': to});
  return res.end();
}


function parseRange(rangeHeader, knownSize) {
  const ranges = rangeHeader.split(/,\s+/g);
  if (ranges.length !== 1) {
    return null;
  }

  const singleRange = ranges[0];
  if (!singleRange.startsWith('bytes=')) {
    return null;
  }
  const actualRange = singleRange.substr('bytes='.length);
  const parts = actualRange.split('-');
  if (parts.length !== 2) {
    return null;
  }

  // nb. Both part values are non-negative, because we split on "-".

  let start = 0;
  let end = knownSize;

  // e.g. "range=-500", return last 500 bytes
  if (parts[1] && !parts[0]) {
    start = Math.max(0, knownSize - parts[1]) || 0;
  } else if (parts[0] && !parts[1]) {
    start = Math.min(+parts[0] || 0, knownSize);
  } else {
    // nb. end is inclusive (for some reason)
    start = Math.min(+parts[0] || 0, knownSize);
    end = Math.min((+parts[1] + 1) || 0, knownSize);
  }

  if (start > end) {
    return null;
  }
  return {start, end}
}


/**
 * Returns the request path as a relative path, dealing with nuances while being
 * served under a different host (c.f. originalUrl). This will always return a
 * string that begins with '.'.
 *
 * @param {types.IncomingMessage} req
 * @return {string}
 */
function relativePath(req) {
  const pathname = decodeURI(req.url || '/');
  if (!pathname || (pathname === '/' && req.originalUrl && !req.originalUrl.endsWith('/'))) {
    // Polka (and others) give us "/" even though the originalUrl might be "/foo". Return a single
    // relative dot so that we can know that we weren't properly terminated with "/".
    return '.';
  }
  return '.' + pathname;
}


/** @type {((f: string) => stream.Readable) | null} */
let moduleRewriter = null;

/** @type {Promise<void>|null} */
let moduleRewriterPromise = null;



/**
 * Builds middleware that serves static files from the specified path, or the
 * current directory by default.
 *
 * @param {types.Options|string} rawOptions
 */
export default function buildHandler(rawOptions) {
  if (typeof rawOptions === 'string') {
    rawOptions = {path: rawOptions};
  }
  /** @type {types.Options} */
  const options = Object.assign({
    path: '.',
    cors: false,
    serveLink: false,
    serveHidden: false,
    listing: true,
    module: false,
  }, rawOptions);

  if (!moduleRewriterPromise && options.module) {
    moduleRewriterPromise = Promise.resolve().then(async () => {
      moduleRewriter = await buildModuleRewriter();
    });
  }

  const redirectToLink = !options.serveLink;
  const rootPath = path.resolve(options.path);  // resolves symlinks in serving path

  // implicit headers
  const defaultHeaders = {
    'Expires': '0',
    'Cache-Control': 'no-store',
  };
  if (options.cors) {
    defaultHeaders['Access-Control-Allow-Origin'] = '*';
  }

  /**
   * @param {http.IncomingMessage} r
   * @param {http.ServerResponse} res
   * @param {() => void} next
   */
  const handler = async (r, res, next) => {
    const req = /** @type {types.IncomingMessage} */ (r);

    // send implicit never-cache headers
    for (const key in defaultHeaders) {
      res.setHeader(key, defaultHeaders[key]);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const realname = decodeURI(req.originalUrl || req.url || '/');
    if (!realname.startsWith('/')) {  // node should prevent this, but sanity-check anyway
      res.writeHead(400);
      return res.end();
    }

    // Call normalize on the absolute pathname (e.g. "/../../foo" => "/foo"), to prevent abuse.
    const normalized = path.posix.normalize(realname);
    if (realname !== normalized) {
      return redirect(res, normalized);
    }

    const pathname = relativePath(req);
    if (!options.serveHidden && pathname.includes('/.')) {
      res.writeHead(404);
      return res.end();
    }

    let filename = path.join(rootPath, '.', platform.posixToPlatform(pathname));  // platform

    // Ensure the requested path is actually real, otherwise redirect to it. This behavior is the
    // default and is 'costly' in that we must call readlink a bunch and do some checks.
    if (redirectToLink) {
      const real = await helper.realpathIn(rootPath, pathname);  // platform
      if (real === null) {
        // can't escape via symlink
        res.writeHead(403);
        return res.end();
      }
      if (real !== filename) {
        const hasTrailingSlash = pathname.endsWith('/');
        if (!hasTrailingSlash) {
          // path.relative includes ".." even if the paths are in the same place
          filename = path.dirname(filename);
        }
        // ... but does not include trailing '/' that we started with
        const suffix = (hasTrailingSlash ? '/' : '');
        return redirect(res, path.relative(filename, real) + suffix);
      }
    }

    let stat = await helper.statOrNull(filename);
    if (stat === null) {
      return next();  // file doesn't exist
    }

    /** @type {stream.Readable} */
    let readStream;

    if (stat.isDirectory()) {
      // check for <dir>/index.html and serve that
      const cand = path.join(filename, 'index.html');
      const indexStat = await helper.statOrNull(cand, redirectToLink);

      if (indexStat && !indexStat.isDirectory() && !indexStat.isSymbolicLink()) {
        // create stream for dir/index.html (not if dir or symlink)
        filename = cand;
        stat = indexStat;

      } else if (!pathname.endsWith('/')) {
        // directory listings must end with / (use realpath)
        const dir = path.posix.basename(realname);
        return redirect(res, `${dir}/`);

      } else if (options.listing) {
        // list contents into simple HTML
        const raw = await listing(filename, realname);
        const buffer = Buffer.from(raw, 'utf-8');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        readStream = helper.createStringReadStream(buffer);
        stat = null;

      } else {
        return next();
      }
    }

    res.setHeader('Accept-Range', 'bytes');

    // can't serve range requests for non-files
    let isRangeRequest = 'range' in req.headers;
    if (isRangeRequest && !stat) {
      res.writeHead(416);
      return res.end();
    }

    // real file, tell the client about it
    if (stat) {
      let readOptions;

      const contentType = mime.getType(filename);
      if (contentType) {
        let extra = '';
        if (contentType.startsWith('text/')) {
          extra = '; charset=utf-8'
        }
        res.setHeader('Content-Type', contentType + extra);
      }

      // TODO(samthor): This rewrite logic is awkwardly placed. We also don't rewrite until it's
      // actually ready.
      if (options.module && moduleRewriter && contentType === 'application/javascript') {
        // TODO(samthor): duplicated from below
        if (req.method === 'HEAD') {
          res.writeHead(200);
          return res.end();
        }

        readStream = moduleRewriter(filename);
        isRangeRequest = false;
      } else {
        readStream = fs.createReadStream(filename, readOptions);

        if (isRangeRequest) {
          readOptions = parseRange(req.headers['range'], stat.size);

          // 'Range' header was invalid or unsupported (e.g. multiple ranges)
          if (!readOptions) {
            res.setHeader('Content-Range', `bytes */${stat.size}`);
            res.writeHead(416);
            return res.end();
          }

          // nb. left side is inclusive (e.g., 128 byte file will be "0-127/128")
          res.setHeader('Content-Range',
              `bytes ${readOptions.start}-${readOptions.end - 1}/${stat.size}`);
          res.setHeader('Content-Length', readOptions.end - readOptions.start);
        } else {
          res.setHeader('Content-Length', stat.size);
        }
      }
    }

    // don't create a readable stream, bail early (used for CORS)
    if (req.method === 'HEAD') {
      res.writeHead(200);
      return res.end();
    }

    // TODO(samthor): TS thinks this isn't defined here.
    // @ts-ignore
    readStream.on('open', () => res.writeHead(isRangeRequest ? 206 : 200));
    // @ts-ignore
    readStream.pipe(res);

    return new Promise((resolve, reject) => {
      readStream.on('end', resolve);
      readStream.on('error', reject);
    });
  };
  return handler;
}
