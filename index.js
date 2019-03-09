#!/usr/bin/env node

const path = require('path');
const http = require('http');
const url = require('url');
const clipboardy = require('clipboardy');

class Server {
  constructor(options={}) {
    this._handler = this._handler.bind(this);

    this.options = Object.assign({
      port: 9000,
      cors: false,
      path: '.',
      bindAll: false,
    }, options);
  }

  async start() {
    const host = this.options.bindAll ? undefined : 'localhost';
    const start = this.options.port;
    let port = start;

    for (;;) {
      this._server = http.createServer(this._handler);
      this._server.listen({
        port,
        host,
      });

      const ok = await new Promise((resolve) => {
        this._server.on('listening', () => resolve(true));
        this._server.on('error', () => resolve(false));
      });
      if (ok) {
        break;
      }

      const count = port - start;
      if (count > 1000) {
        throw new Error(`tried ${count} ports, could not serve`)
      }
      ++port;
    }

    const v = `http://${host}:${port}`;
    console.info('got server', v);
    clipboardy.writeSync(v);
  }

  _handler(req, res) {
    const uri = req.path = decodeURIComponent(url.parse(req.url).pathname);
    const filename = path.join('.', uri);

    console.info('got request', uri, filename);

    if (this.options.cors) {
      res.headers['Access-Control-Allow-Origin'] = '*';
    }

    res.writeHead(200);
    res.write('Hiiii');
    res.end();
  }
}



async function start() {
  const s = new Server()
  await s.start();
}

start().catch((err) => {
  console.info('failed', err);
});