#!/usr/bin/env node

import buildHandler from '../index.js';
import bytes from 'bytes';
import * as color from 'colorette';
import * as http from 'http';
import mri from 'mri';
import * as network from './network.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import check from './check.js';
import {copyToClipboard} from './clipboard.js';


const {pathname: specPath} = new URL('../package.json', import.meta.url);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));


const options = mri(process.argv.slice(2), {
  default: {
    defaultPort: 9000,
    port: null,
    cors: false,
    serveLink: false,
    bindAll: false,
    help: false,
    skipCheck: false,
  },
  alias: {
    defaultPort: ['d', 'default-port'],  // not visible in help
    port: 'p',
    cors: 'c',
    serveLink: ['l', 'serve-link'],
    serveHidden: ['d', 'serve-hidden'],
    bindAll: ['a', 'bind-all'],
    skipCheck: ['n', 'skip-check'],
    module: 'm',
    help: 'h',
  },
  unknown: (v) => {
    console.error('error: unknown option `' + v + '`');
    process.exit(1);
  },
});

if (options.help) {
  const helpString = `Usage: ${spec['name']} [options] <root_path>

Development HTTP server for static files, instructing browsers NEVER to cache
results. Serves from the specified path (default "."). Directories show simple
listing or any found "index.html" file.

Options:
  -p, --port <n>       explicit serving port
  -c, --cors           whether to allow CORS requests
  -m, --module         rewrite JS to include ESM imports
  -l, --serve-link     serve symlink target (unsafe, allows escaping root)
  -d, --serve-hidden   serve hidden files (by default these 404)
  -a, --bind-all       listen on all network interfaces, not just localhost
  -n, --skip-check     don't check for an updated version of ${spec['name']}

v${spec['version']}
  `;

  console.info(helpString);
  process.exit(0);
}


if (typeof options.port !== 'number') {
  options.port = null;
}
options.path = options._[0] || '.';
const handler = buildHandler(options);


async function bindAndStart() {
  const internalHandler = (req, res) => {
    // call our generated middleware and fail with 404 or 405
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
  };

  const host = options.bindAll ? undefined : 'localhost';
  const start = options.port || options.defaultPort;
  let port = start;

  for (;;) {
    const server = http.createServer(internalHandler);
    server.listen({host, port});

    const ok = await new Promise((resolve) => {
      server.on('listening', () => resolve(true));
      server.on('error', () => resolve(false));
    });
    if (ok) {
      return server;
    }

    // explicit port requested, but it couldn't be served
    if (options.port) {
      throw new Error(`Could not bind to requested port: ${options.port}`);
    }

    // otherwise, increment and try a new port
    ++port;
    const count = port - start;
    if (count > 1000) {
      throw new Error(`Tried ${count} ports, could not serve`);
    }
  }
}


bindAndStart().then((server) => {
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

  console.info(color.blue('*'), 'Serving static files from', color.cyan(path.resolve(options.path)));
  console.info(color.blue('*'), 'Local', color.green(localURL), clipboardError ? color.red('(could not copy to clipboard)') : color.dim('(on your clipboard!)'));

  if (options.bindAll) {
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

}).catch((err) => {
  console.error(err);
  process.exit(1);
});


(async function checkForUpdate() {
  if (options.skipCheck) {
    return;
  }

  // TODO(samthor): use a package helper (which might create a temp folder)

  const after = 1000 * (10 + 10 * Math.random());  // 10-20 sec delay
  await new Promise((r) => setTimeout(r, after));

  const latestVersion = await check(spec);
  if (!latestVersion) {
    return;  // up-to-date
  }

  process.on('SIGINT', () => {
    process.exit(128 + (os.constants.signals.SIGINT || 0));
  });

  process.on('exit', () => {
    console.info();
    console.info(`${color.bold(spec['name'])} upgrade available (latest ${color.green(latestVersion)}, installed ${color.red(spec['version'])})`);
  });

}()).catch((err) => {
  // ignore err
});
