
import * as types from '../types/index.js';
import listing from './listing.js';
import mime from 'mime';


/**
 * @param {types.RArg} arg
 * @return {Promise<types.RResult|undefined>}
 */
export async function directoryListing(arg) {
  if (!arg.stat?.isDirectory()) {
    return;
  }
  const raw = await listing(arg.filename, arg.pathname);
  const buffer = Buffer.from(raw, 'utf-8');
  return {buffer, contentType: 'text/html'};
}


/** @type {((f: string, write: (part: Uint8Array) => void) => void) | null} */
let sharedModuleRewriter = null;


/**
 * @param {types.RArg} arg
 * @return {Promise<types.RResult|undefined>}
 */
export async function moduleRewriter(arg) {
  if (!arg.stat?.isFile() || mime.getType(arg.filename) !== 'application/javascript') {
    return;
  }

  if (!sharedModuleRewriter) {
    const {default: buildModuleRewriter} = await import('gumnut/imports');
    const {default: buildResolver} = await import('esm-resolve');
    sharedModuleRewriter = await buildModuleRewriter(buildResolver);
  }

  /** @type {Uint8Array[]} */
  const parts = [];
  sharedModuleRewriter(arg.filename, (part) => parts.push(part));
  return {buffer: Buffer.concat(parts)};
}

