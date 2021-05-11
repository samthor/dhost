
import buildModuleRewriter from 'gumnut/imports';
import buildResolver from 'esm-resolve';


const moduleRewriter = await buildModuleRewriter(buildResolver);

const id = Math.floor(Math.random() * 255).toString()

/**
 * @param {string} filename
 * @return {Buffer}
 */
export default function convert(filename) {
  /** @type {Uint8Array[]} */
  const parts = [];
  moduleRewriter(filename, (part) => parts.push(part));
  return Buffer.concat(parts);
}
