
import mime from 'mime';

/**
 * @param {string} filename
 * @return {string?}
 */
export function getType(filename) {
  if (filename.endsWith('.ts')) {
    return 'application/x-typescript';
  }
  return mime.getType(filename);
}
