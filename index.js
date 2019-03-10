#!/usr/bin/env node

const buildHandler = require('./mware.js');
const bytes = require('bytes');
const chalk = require('chalk');
const clipboardy = require('clipboardy');
const http = require('http');
const path = require('path');
const network = require('./network.js');


const options = {
  defaultPort: 9000,
  port: null,
  cors: false,
  path: '.',
  bindAll: true,
};


async function bindAndStart() {
  let handler;

  const internalHandler = (req, res) => {
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
      break;
    }
    if (options.port) {
      throw new Error(`Could not bind to requested port: ${options.port}`);
    }

    const count = port - start;
    if (count > 1000) {
      throw new Error(`tried ${count} ports, could not serve`);
    }
    ++port;
  }

  handler = buildHandler(options, server);
 
  const v = `http://${host}:${port}`;
  clipboardy.writeSync(v);
  return server;
}


bindAndStart().then((server) => {
  const serverAddress = server.address();
  const localURL = `http://localhost:${serverAddress.port}`;
  clipboardy.writeSync(localURL);

  console.info(chalk.blue('*'), 'Serving static files from', chalk.cyan(path.resolve(options.path)));
  console.info(chalk.blue('*'), 'Local', chalk.green(localURL), chalk.dim('(on your clipboard!)'));

  if (options.bindAll) {
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
      requestParts.push(chalk.gray(remoteAddress));  // display non-localhost requests
    }

    console.info(chalk.gray('>'), chalk.cyan(req.method), requestParts.join(' '));
    const start = process.hrtime();

    res.on('finish', () => {
      const duration = process.hrtime(start);
      const ms = ((duration[0] + (duration[1] / 1e9)) * 1e3).toFixed(3);

      const responseColor = res.statusCode >= 400 ? chalk.red : chalk.green;
      const parts = [responseColor(res.statusCode), responseColor(res.statusMessage)];

      let url = req.url;
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const location = res.getHeader('Location');
        if (location) {
          url = path.join(req.url, location);
        }
      }
      parts.push(url);
      parts.push(chalk.dim(`${ms}ms`));

      const contentLength = res.getHeader('Content-Length');
      if (contentLength != null) {  // null or undefined
        const displayBytes = bytes(+contentLength || 0);
        parts.push(displayBytes);
      }

      console.info(chalk.gray('<'), parts.join(' '));
    });
  });

}).catch((err) => console.error(err));
