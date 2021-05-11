
import * as fs from 'fs';
import * as helper from './helper.js';
import * as platform from './platform.js';
import * as path from 'path';
import * as http from 'http';
import * as types from '../types/index.js';
import * as httpHelper from './http.js';


/**
 * At this number of bytes or below, just read the whole file into memory with `fs.readFileSync`
 * before writing it to the client. It's too small to do anything tricky.
 */
const READ_SYNC_THRESHOLD = (64 * 1024);



/**
 * Builds middleware that serves static files from the specified path, or the current directory by
 * default.
 *
 * @param {Partial<types.ServeOptions>|string} rawOptions
 * @return {types.Handler}
 */
export default function buildHandler(rawOptions = '.') {
  if (typeof rawOptions === 'string') {
    rawOptions = {path: rawOptions};
  }
  /** @type {types.ServeOptions} */
  const options = Object.assign({
    path: '.',
    cors: false,
    serveLink: false,
    serveHidden: false,
    rewriters: [],
  }, rawOptions);

  const redirectToLink = !options.serveLink;
  const rootPath = path.resolve(options.path);  // resolves symlinks in serving path

  // implicit headers
  /** @type {{[key: string]: string}} */
  const defaultHeaders = {
    'Expires': '0',
    'Cache-Control': 'no-store',
  };
  if (options.cors) {
    defaultHeaders['Access-Control-Allow-Origin'] = '*';
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {() => void} next
   */
  const handler = async (req, res, next) => {
    // send implicit never-cache headers
    for (const key in defaultHeaders) {
      res.setHeader(key, defaultHeaders[key]);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const {pathname, search} = httpHelper.parseUrl(req.url);
    if (!pathname.startsWith('/')) {  // node should prevent this, but sanity-check anyway
      res.writeHead(400);
      return res.end();
    }

    // Call normalize on the absolute pathname (e.g. "/../../foo" => "/foo"), to prevent abuse.
    const normalized = path.posix.normalize(pathname);
    if (pathname !== normalized) {
      return httpHelper.redirect(res, normalized);
    }

    // This is a relative path which always starts with ".".
    const rel = httpHelper.relativePath(req);
    if (!options.serveHidden && rel.includes('/.')) {
      res.writeHead(404);
      return res.end();
    }

    let filename = path.join(rootPath, '.', platform.posixToPlatform(rel));  // platform

    // Ensure the requested path is actually real, otherwise redirect to it. This behavior is the
    // default and is 'costly' in that we must call readlink a bunch and do some checks.
    if (redirectToLink) {
      const real = await helper.realpathIn(rootPath, rel);  // platform
      if (real === null) {
        // can't escape via symlink
        res.writeHead(403);
        return res.end();
      }
      if (real !== filename) {
        const hasTrailingSlash = rel.endsWith('/');
        if (!hasTrailingSlash) {
          // path.relative includes ".." even if the paths are in the same place
          filename = path.dirname(filename);
        }
        // ... but does not include trailing '/' that we started with
        const suffix = (hasTrailingSlash ? '/' : '');
        return httpHelper.redirect(res, path.relative(filename, real) + suffix);
      }
    }

    let stat = await helper.statOrNull(filename);
    if (stat && req.method === 'HEAD') {
      return res.end();
    }

    // Check for <dir>/index.html or a directory needing a trailing slash.
    if (stat?.isDirectory()) {
      const cand = path.join(filename, 'index.html');
      const indexStat = await helper.statOrNull(cand, redirectToLink);

      if (indexStat && !indexStat.isDirectory() && !indexStat.isSymbolicLink()) {
        // create stream for dir/index.html (not if dir or symlink)
        filename = cand;
        stat = indexStat;

      } else if (!rel.endsWith('/')) {
        // we always redirect into directories and add /
        const dir = path.posix.basename(rel);
        return httpHelper.redirect(res, `${dir}/`);
      }
    }

    // Check if we're handled by a rewriter.
    const arg = {stat, filename, pathname, search};
    for (const rw of options.rewriters) {
      const ret = await rw(arg);
      if (!ret) {
        continue;
      }

      // This is a virtual file (created by rewriter), but we had a HEAD request. Return early.
      if (!stat && req.method === 'HEAD') {
        return res.end();
      }

      // Some rewriter caught us. Render its output.
      httpHelper.writeContentType(res, filename, ret.contentType);
      res.setHeader('Content-Length', ret.buffer.length);

      await helper.asyncWrite(res, ret.buffer);
      return res.end();
    }

    // This file doesn't really exist; we can't serve it.
    if (!stat || stat.isDirectory()) {
      return next();
    }

    /** @type {{start: number, end: number}=} */
    let readOptions = undefined;

    const rangeHeader = req.headers['range'];
    if (rangeHeader) {
      readOptions = httpHelper.parseRange(rangeHeader, stat.size);

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
    httpHelper.writeContentType(res, filename);
    res.setHeader('Accept-Ranges', 'bytes');

    // Short-circuit if the file is small. This still supports range requests.
    if (stat.size <= READ_SYNC_THRESHOLD) {
      let buffer = fs.readFileSync(filename);
      if (readOptions) {
        buffer = buffer.slice(readOptions.start, readOptions.end);
        res.writeHead(206);
      }
      await helper.asyncWrite(res, buffer);
      return res.end();
    }

    const readStream = fs.createReadStream(filename, readOptions);

    readStream.on('open', () => res.writeHead(rangeHeader ? 206 : 200));
    readStream.pipe(res);

    return new Promise((resolve, reject) => {
      readStream.on('end', resolve);
      readStream.on('error', reject);
    });
  };
  return handler;
}
