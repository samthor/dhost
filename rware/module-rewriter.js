
import * as types from '../types/index.js';
import mime from 'mime';
import {pool} from 'async-transforms/worker';


const workerPath = new URL('./module-rewriter-helper.js', import.meta.url).pathname;
const asyncCompileTask = pool(workerPath, {minTasks: 1, expiry: 60_000});


/**
 * @param {types.RArg} arg
 * @return {Promise<types.RResult|undefined>}
 */
export default async function moduleRewriter(arg) {
  if (!arg.stat?.isFile() || mime.getType(arg.filename) !== 'application/javascript') {
    return;
  }

  const buffer = /** @type {Buffer} */ (await asyncCompileTask(arg.filename));
  return {buffer};
}
