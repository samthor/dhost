
import * as types from '../types/index.js';
import mime from 'mime';


/** @type {((f: string, write: (part: Uint8Array) => void) => void) | null} */
let sharedModuleRewriter = null;


/**
 * @param {types.RArg} arg
 * @return {Promise<types.RResult|undefined>}
 */
export default async function moduleRewriter(arg) {
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

