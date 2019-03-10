
const fs = require('fs');
const he = require('he');
const mime = require('mime');
const path = require('path');
const stream = require('stream');
const url = require('url');


/**
 * @param {string} filename
 * @param {boolean=} hidden whether to include hidden files
 * @return {!Array<string>} contents of directory
 */
async function directoryContents(filename, hidden=false) {
  let listing = fs.readdirSync(filename);
  if (!hidden) {
    listing = listing.filter((cand) => cand[0] !== '.');
  }

  const s = (cand) => fs.statSync(path.join(filename, cand));
  const stats = await Promise.all(listing.map(s));

  listing = listing.map((cand, i) => {
    const stat = stats[i];
    if (stat.isDirectory()) {
      return cand + '/';  // don't use path.sep, HTTP servers are always /
    }
    return cand;
  });

  listing.sort((a, b) => {
    const dirA = a[a.length - 1] === '/';
    const dirB = b[b.length - 1] === '/';

    // place subdirs first
    if (dirA !== dirB) {
      if (dirA) {
        return -1;
      } else {
        return +1;
      }
    }

    // sort by name
    if (a[0] < b[0]) {
      return -1;
    } else if (a[0] > b[0]) {
      return +1;
    }
    return 0;
  });

  return listing;
}


function createStringReadStream(raw) {
  const r = new stream.Readable();
  r.push(raw);
  r.push(null);
  return r;
}


async function statOrNull(filename) {
  try {
    return fs.statSync(filename);
  } catch (err) {
    return null;
  }
}


module.exports = (options) => {
  options = Object.assign(options, {
    path: '.',
    cors: false,
  });

  const rootPath = path.resolve(options.path);

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

    // nb. NodeJS' HTTP server seems to prevent abuse, but it's worth checking
    let filename = path.join(rootPath, '.', decodeURI(url.parse(req.url).pathname));
    if (path.relative(rootPath, filename).startsWith('../')) {
      res.writeHead(403);
      return res.end();
    }

    let stat = await statOrNull(filename);
    if (stat === null) {
      return next();  // file doesn't exist
    }

    let readStream = null;

    if (stat.isDirectory()) {
      // check for dir/index.html and serve that
      const cand = path.join(filename, 'index.html');
      const defaultIndexStat = await statOrNull(cand);

      if (defaultIndexStat && !defaultIndexStat.isDirectory()) {
        // create stream for dir/index.html
        filename = cand;
        stat = defaultIndexStat;

      } else if (!filename.endsWith('/')) {
        // directory listings must end with /
        const dir = path.basename(filename);
        res.writeHead(302, {'Location': dir + '/'});
        return res.end();

      } else {
        // list contents into simple HTML
        // TODO(samthor): super-basic nice template
        const contents = await directoryContents(filename);
        const raw = contents.map((pathname) => {
          const escaped = escape(pathname);
          const encoded = he.encode(pathname);
          return `<a href="${escaped}">${encoded}</a><br />\n`;
        }).join('');

        const buffer = Buffer.from(raw, 'utf-8');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Type', 'text/html');
        readStream = await createStringReadStream(buffer);
        stat = null;
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
