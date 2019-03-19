
const stream = require('stream');
const fs = require('fs');


/**
 * @param {string} raw string to push into readable stream
 * @return {!stream.Readable} stream of string
 */
function createStringReadStream(raw) {
  const r = new stream.Readable();
  r.push(raw);
  r.push(null);
  return r;
}


/**
 * @param {string} filename to call realpath on
 * @return {?string} realpath or null
 */
async function realpathOrNull(filename) {
  return await new Promise((r) => {
    fs.realpath(filename, (err, resolved) => r(err ? null : resolved));
  });
}


/**
 * @param {string} filename to stat
 * @param {boolean} lstat whether to use lstat
 * @return {?fs.Stats} stats or null for unknown file
 */
async function statOrNull(filename, lstat=false) {
  const method = lstat ? fs.lstat : fs.stat;
  return await new Promise((r) => {
    method(filename, (err, stats) => r(err ? null : stats));
  });
}


module.exports = {
  createStringReadStream,
  realpathOrNull,
  statOrNull,
};
