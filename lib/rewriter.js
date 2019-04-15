const fs = require('fs');
const path = require('path');

const encoder = new TextEncoder();
const decoder = new TextDecoder();


class PrsrView {
  constructor(runner, at, buf, view) {
    this._runner = runner;
    this._at = at;
    this._buf = buf;
    this._view = view;
  }

  run(callback) {
    const rewrites = []; //{at, len, data};

    this._runner._with(this._at, this._buf, (loc, len, lineNo, type, mark) => {
      if (mark == 1) {
        // found an import rewritable
        const view = this._view.subarray(loc, loc + len);
        const value = decoder.decode(view);
        rewrites.push({loc, len, value});
      }
    });

    return rewrites;
  }
}


class PrsrRunner {
  constructor() {
    this._prepare = PrsrRunner._prepare(this);
    this._lookup = new Map();
    this._used = 0;
    this._exports = undefined;
  }

  _with(at, buf, callback) {
    this._lookup.set(at, {callback, buf});
    try {
      return this._exports._prsr_run(at);
    } finally {
      this._lookup.delete(at);
    }
  }

  async prepare(code, options={}) {
    const {exports, memory} = await this._prepare;
    this._exports = exports;  // cache awaited result
    const array = new Uint8Array(memory.buffer);

    // FIXME: just dumping into end of memory right now
    const size = exports._prsr_size();
    const at = array.length - this._used - size;
    const bytes = code instanceof Buffer ? code : encoder.encode(code);
    const buf = at - bytes.length - 1;

    this._used = array.length - buf;
    console.info('used bytes', this._used);

    const view = array.subarray(buf, buf + bytes.length);
    view.set(bytes);
    array[buf + bytes.length] = 0;  // EOF

    exports._prsr_setup(at, buf, options.module ? 1 : 0);
    return new PrsrView(this, at, buf, view);
  }

  _token_callback(at, p, len, lineNo, type, mark) {
    const context = this._lookup.get(at);
    if (!context) {
      throw new Error(`unregistered address: ${at}`);
    }
    const loc = p - context.buf;
    context.callback(loc, len, lineNo, type, mark);
  }

  static async _prepare(o) {
    const env = {
      memory: new WebAssembly.Memory({initial: 256, maximum: 256}),
      table: new WebAssembly.Table({initial: 2, maximum: 2, element: 'anyfunc'}),
      __table_base: 0,
  
      abort(arg) {
        throw new Error(`abort: ${arg}`);
      },
  
      _token_callback: o._token_callback.bind(o),
    };

    const importObject = {env};
    const raw = fs.readFileSync(path.join(__dirname, 'runner.wasm'));
  
    const object = await WebAssembly.instantiate(raw, importObject);
    object.importObject = importObject;
  
    const exports = object.instance.exports;
    return {exports, memory: env.memory};
  }
}


const relativeMatch = /^(\w+:\/|\.\.?)\//;

function rewrite(filename, importValue) {
  if (relativeMatch.test(importValue)) {
    return importValue;
  }
  let resolved;
  try {
    resolved = require.resolve(importValue, {paths: [process.cwd()]});
  } catch (e) {
    console.warn('got err', e, importValue);
    return importValue;
  }
  const out = path.relative(path.dirname(filename), resolved);
  if (!out.startsWith('./')) {
    return './' + out;
  }
  return out;
}



const runner = new PrsrRunner();

async function run(filename, code, options) {

  // read bytes here so comparison is fair
  code = fs.readFileSync(filename);

  const view = await runner.prepare(code, options);
  const rewrites = view.run();
  let adjust = 0;

  rewrites.forEach(({value}, i) => {
    const v = value.substr(1, value.length - 2);
    const out = JSON.stringify(rewrite(filename, v));
    adjust += (out.length - value.length);
    rewrites[i].update = out;
  });

  const out = new Buffer(view._view.length + adjust);
  let at = 0;
  let from = 0;

  for ({loc, len, value, update} of rewrites) {
    // copy until first update
    out.set(view._view.subarray(from, loc), at);
    at += (loc - from);  // count past how many bytes we used
    from = loc + len;  // move past original real one

    // copy new string
    const bytes = encoder.encode(update);
    out.set(bytes, at);
    at += bytes.length;
  }

  // write trailing stuff
  out.set(view._view.subarray(from), at);
  return out;
}

module.exports = run;
