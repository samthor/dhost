
import buildHandler from '../lib/handler.js';
import bytes from 'bytes';
import * as color from 'colorette';
import * as network from './network.js';
import * as path from 'path';
import * as types from '../types/index.js';
import { copyToClipboard } from './clipboard.js';
import { bindAndStart } from '../lib/server.js';


/**
 * @param {types.MainOptions} options
 * @return {Promise<never>}
 */
export async function main(options = {}) {
  const handler = buildHandler(options);

  // This isn't really any of the types objects, but is close enough.
  const o = Object.assign({
    path: '.',
  }, options);

  const server = await bindAndStart(o, (req, res) => {
    handler(req, res, () => {
      let status = 404;

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        status = 405;
      }
      res.writeHead(status);
      res.end();
    }).catch((err) => {
      console.info(color.red('!'), err);
      res.writeHead(500);
      res.end();
    });
  });

  const serverAddress = server.address();
  if (!serverAddress || !(typeof serverAddress === 'object')) {
    throw new Error(`could not find serverAddress: ${serverAddress}`);
  }
  const localURL = `http://localhost:${serverAddress.port}`;

  let clipboardError = null;
  try {
    // Copying to clipboard can fail on headless Linux systems (possibly others).
    copyToClipboard(localURL);
  } catch (e) {
    clipboardError = e;
  }

  console.info(color.blue('*'), 'Serving static files from', color.cyan(path.resolve(o.path)));
  console.info(color.blue('*'), 'Local', color.green(localURL), clipboardError ? color.red('(could not copy to clipboard)') : color.dim('(on your clipboard!)'));

  if (o.bindAll) {
    // log all IP addresses we're listening on
    const ips = network.localAddresses();
    ips.forEach(({address, family}) => {
      let display = address;
      if (family === 'IPv6') {
        display = `[${display}]`;
      }
      console.info(color.blue('*'), 'Network', color.green(`http://${display}:${serverAddress.port}`));
    });
  }

  const padSize = Math.min(80, localURL.length * 2);
  console.info(''.padEnd(padSize, '-'));

  server.on('request', (req, res) => {
    const requestParts = [req.url];

    const forwardedFor = req.headers['x-forwarded-for'] || '';
    const remoteAddresses = network.mergeForwardedFor(forwardedFor, req.socket.remoteAddress);
    for (const remoteAddress of remoteAddresses) {
      requestParts.push(color.gray(remoteAddress));  // display remote addr for non-localhost
    }

    console.info(color.gray('>'), color.cyan(req.method), requestParts.join(' '));
    const start = process.hrtime();

    res.on('finish', () => {
      const duration = process.hrtime(start);
      const ms = ((duration[0] + (duration[1] / 1e9)) * 1e3).toFixed(3);

      const responseColor = res.statusCode >= 400 ? color.red : color.green;
      const responseParts = [responseColor(res.statusCode), responseColor(res.statusMessage)];

      // Render the served URL, or the 3xx 'Location' field
      let url = req.url;
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.getHeader('Location');
        if (location) {
          if (path.isAbsolute(location)) {
            url = location;
          } else {
            let base = req.url;
            if (base.endsWith('/')) {
              base += '.';
            }
            url = path.join(path.dirname(base), location);
          }
        }
      }
      responseParts.push(url);
      responseParts.push(color.dim(`${ms}ms`));

      // Content-Length is only set by user code, not by Node, so it might not always exist
      const contentLength = res.getHeader('Content-Length');
      if (contentLength != null) {  // null or undefined
        const displayBytes = bytes(+contentLength || 0);
        responseParts.push(displayBytes);
      }

      console.info(color.gray('<'), responseParts.join(' '));
    });
  });

  await new Promise((_, reject) => {
    server.on('error', reject);
  });
  throw new Error(`internal error, should never shutdown`);
}