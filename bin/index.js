#!/usr/bin/env node

const buildHandler = require('../index.js');
const bytes = require('bytes');
const chalk = require('chalk');
const check = require('./check.js');
const clipboardy = require('clipboardy');
const http = require('http');
const mri = require('mri');
const network = require('./network.js');
const os = require('os');
const path = require('path');

const spec = require('../package.json');


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
    port: 'p',
    cors: 'c',
    serveLink: ['l', 'serve-link'],
    bindAll: ['a', 'bind-all'],
    skipCheck: ['n', 'skip-check'],
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
results. Serves from any number of paths (default "."). Directories show simple
listing or any found "index.html" file.

Options:
  -p, --port <n>       explicit serving port
  -c, --cors           whether to allow CORS requests
  -l, --serve-link     serve symlink target (unsafe, allows escaping root)
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
      console.info(chalk.red('!'), err);
      res.writeHead(500);
      res.end();
    });
  };

  const host = options.bindAll ? undefined : 'localhost';
  const start = options.port || options.defaultPort;
  let port = start;

  for (;;) {
    server = http.createServer(internalHandler);
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
      throw new Error(`tried ${count} ports, could not serve`);
    }
  }
}


bindAndStart().then((server) => {
  const serverAddress = server.address();
  const localURL = `http://localhost:${serverAddress.port}`;
  clipboardy.writeSync(localURL);

  console.info(chalk.blue('*'), 'Serving static files from', chalk.cyan(path.resolve(options.path)));
  console.info(chalk.blue('*'), 'Local', chalk.green(localURL), chalk.dim('(on your clipboard!)'));

  if (options.bindAll) {
    // log all IP addresses we're listening on
    const ips = network.localAddresses();
    ips.forEach(({address, family}) => {
      let display = address;
      if (family === 'IPv6') {
        display = `[${display}]`;
      }
      console.info(chalk.blue('*'), 'Network', chalk.green(`http://${display}:${serverAddress.port}`));
    });
  }

  const padSize = Math.min(80, localURL.length * 2);
  console.info(''.padEnd(padSize, '-'))

  server.on('request', (req, res) => {
    const requestParts = [req.url];
    const remoteAddress = network.formatRemoteAddress(req.socket.remoteAddress);
    if (remoteAddress) {
      requestParts.push(chalk.gray(remoteAddress));  // display remote addr for non-localhost
    }

    console.info(chalk.gray('>'), chalk.cyan(req.method), requestParts.join(' '));
    const start = process.hrtime();

    res.on('finish', () => {
      const duration = process.hrtime(start);
      const ms = ((duration[0] + (duration[1] / 1e9)) * 1e3).toFixed(3);

      const responseColor = res.statusCode >= 400 ? chalk.red : chalk.green;
      const responseParts = [responseColor(res.statusCode), responseColor(res.statusMessage)];

      // Render the served URL, or the 3xx 'Location' field
      let url = req.url;
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.getHeader('Location');
        if (location) {
          if (path.isAbsolute(location)) {
            url = location;
          } else {
            url = path.join(req.url, location);
          }
        }
      }
      responseParts.push(url);
      responseParts.push(chalk.dim(`${ms}ms`));

      // Content-Length is only set by user code, not by Node, so it might not always exist
      const contentLength = res.getHeader('Content-Length');
      if (contentLength != null) {  // null or undefined
        const displayBytes = bytes(+contentLength || 0);
        responseParts.push(displayBytes);
      }

      console.info(chalk.gray('<'), responseParts.join(' '));
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
    console.info(`${chalk.bold(spec['name'])} upgrade available (latest ${chalk.green(latestVersion)}, installed ${chalk.red(spec['version'])})`);
  });

}()).catch((err) => {
  // ignore err
  console.debug('udpate check err', err);
});
