#!/usr/bin/env node

import * as color from 'colorette';
import mri from 'mri';
import * as os from 'os';
import * as fs from 'fs';
import check from './check.js';
import { main } from './main.js';
import directoryListing from '../rware/directory-listing.js'
import moduleRewriter from '../rware/module-rewriter.js';


const {pathname: specPath} = new URL('../package.json', import.meta.url);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));


const options = mri(process.argv.slice(2), {
  default: {
    defaultPort: 9000,
    port: null,
    cors: false,
    serveLink: false,
    bindAll: false,
    skipCheck: false,
    module: false,
    help: false,
  },
  alias: {
    defaultPort: ['d', 'default-port'],  // not visible in help
    port: 'p',
    cors: 'c',
    serveLink: ['l', 'serve-link'],
    serveHidden: ['d', 'serve-hidden'],
    bindAll: ['a', 'bind-all'],
    module: 'm',
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


// Enqueue a check update to happen later.
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


const rewriters = [directoryListing];
if (options.module) {
  rewriters.push(moduleRewriter);
}

await main({
  path: options.path,
  cors: options.cors,
  serveLink: options.serveLink,
  serveHidden: options.serveHidden,
  rewriters,
  port: options.port || options.defaultPort,
  targetPort: Boolean(options.port),
  bindAll: options.bindAll,
});
