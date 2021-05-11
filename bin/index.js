#!/usr/bin/env node

import * as color from 'colorette';
import mri from 'mri';
import * as os from 'os';
import * as fs from 'fs';
import check from './check.js';
import { main } from './main.js';
import * as types from '../types/index.js';
import * as path from 'path';


const {pathname: __filename} = new URL(import.meta.url);
const __dirname = path.dirname(__filename);


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
    import: 'i',
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
  -i, --import <path>  use this ES Module which default exports a rewriter

v${spec['version']}
  `;

  console.info(helpString);
  process.exit(0);
}

if (typeof options.port !== 'number') {
  options.port = null;
}


// Find all requested imports (relative to cwd, not this file), and add our own defaults (directory
// listing and optional module rewriter).
const rewritersImports = [options.import || []].flat().map((p) => {
  return path.relative(__dirname, path.resolve(p));
});
if (options.module) {
  rewritersImports.push('../rware/module-rewriter.js');
}
rewritersImports.unshift('../rware/directory-listing.js');
const rewriters = await Promise.all(rewritersImports.map(async (i) => {
  return /** @type {types.Rewriter} */ ((await import(i)).default);
}));


// Enqueue a check update to happen later.
if (!options.skipCheck) {
  checkForUpdate().catch(() => {});
}


// Party!
await main({
  path: options._[0] || '.',
  cors: options.cors,
  serveLink: options.serveLink,
  serveHidden: options.serveHidden,
  rewriters,
  port: options.port || options.defaultPort,
  targetPort: Boolean(options.port),
  bindAll: options.bindAll,
});


async function checkForUpdate() {
  const after = 1000 * (60 + 20 * Math.random());  // 60-80 sec delay
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
}