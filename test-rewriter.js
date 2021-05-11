
import * as types from './types/index.js';
import mime from 'mime';


/**
 * @param {types.RArg} arg
 * @return {Promise<types.RResult|undefined>}
 */
export default async function moduleRewriter(arg) {
  if (arg.search === '?lol') {
    return {buffer: new Buffer('lol', 'utf-8')};
  }
}
