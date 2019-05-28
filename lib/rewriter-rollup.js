const rollup = require('rollup');
const rollupNodeResolve = require('rollup-plugin-node-resolve');

const relativeMatch = /^(\w+:\/|\.{0,2})\//;


module.exports = async function(filename, code, options) {
  const bundle = await rollup.rollup({
    input: filename,
    plugins: [
      {
        resolveId(id, parent) {
          console.info('resolving', id, parent);
          if (parent != null) {
//            return {id};
          }
        },
      },
      rollupNodeResolve(),
    ],
    preserveModules: true,
    external: (id) => {
      if (relativeMatch.test(id)) {
        return true;
      }
//      console.info('REQ externael', id);
    },
  });

  const out = await bundle.generate({
    format: 'es',
    treeshake: false,  // we want to cache the results
  });

  console.info('got outputs', out.output.length);
  return out.output[0].code;
};