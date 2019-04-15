const fs = require('fs');

async function bootstrap() {
  const env = {
    memory: new WebAssembly.Memory({initial: 256, maximum: 256}),
    table: new WebAssembly.Table({initial: 2, maximum: 2, element: 'anyfunc'}),
    __table_base: 0,

    abort(arg) {
      throw new Error(`abort: ${arg}`);
    },

    // callbacks here
    _token_callback(p, len, line_no, type, mark) {
//      globalCallback(p, len, line_no, type, mark);
    },
  };

  const importObject = {env};
  const raw = fs.readFileSync('runner.wasm');

  const object = await WebAssembly.instantiate(raw, importObject);
  object.importObject = importObject;

  const exports = object.instance.exports;
  console.info(object, exports);
}

bootstrap().catch((err) => console.warn(err));