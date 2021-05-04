
import * as types from '../types/index.js';
import * as http from 'http';


/**
 * @param {Partial<types.BindOptions>} options
 * @param {types.InternalHandler} handler
 * @return {Promise<http.Server>}
 */
export async function bindAndStart(options, handler) {
  const host = options.bindAll ? undefined : 'localhost';
  const start = options.port || 9000;
  let port = start;

  for (;;) {
    const server = http.createServer(handler);
    server.listen({host, port});

    const ok = await new Promise((resolve) => {
      server.on('listening', () => resolve(true));
      server.on('error', () => resolve(false));
    });
    if (ok) {
      return server;
    }

    // explicit port requested, but it couldn't be served
    if (options.targetPort) {
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

