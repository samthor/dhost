The never-caching development Node webserver for static files.
This instructs browsers _never_ to cache any requested resources.
If you've ever had to mash _Ctrl/Cmd-R_ to ensure your browser is seeing the latest version of a static site, you'll know this feeling.

Install globally via `npm -g install dhost` or `yarn global add dhost`, then run `dhost`.

⚠️ This is just for development.
Don't use it in any sort of production.
It reqiures Node 14+.

# Running

Run `dhost -h` for flags.
By default, this hosts only on `localhost`, on the first available port 9000 or above, and copies the serving URL to your clipboard (works on macOS, _or_ if the optional `clipboardy` is found).

If you need to serve CORS requests, run with `-c`; if you need to rewrite ESM imports in JS files, run with `-m`.

# Magic

The goal of this server is not to surprise you, and to avoid magic where possible.
Its behavior will never intentionally match any particular hosting platform's semantics.

Here are the exceptions:

* We serve `index.html` if found, or generate a simple directory listing otherwise
* Symlinks generate a 302 to their target file if it's within the root (serve contents instead via `-l`)
* No data is served for other status codes (i.e., your browser will render its own 404 page)

## Modules

✨ New! ✨ Specify `-m` to rewrite your JS to include static ESM imports (e.g., "viz-observer" => "/node_modules/viz-observer/index.js").

This only works on static imports (e.g., `import 'foobar';'`), not dynamic ones (e.g., `import('foobar')`), as these can be any string (including ones generated at runtime).
If you need to dynamically import from node_modules, add an extra helper file which doesn't need to be rewritten:

```js
// your code
const foobarModule = await import('./foobar-wrapper.js');

// foobar-wrapper.js
export * from 'foobar';
```

Your build tools will compile this out, so the extra step won't effect a production build.

# Middleware

This can be used as middleware.
To serve the current directory—without caching—using [Polka](https://github.com/lukeed/polka):

```js
const polka = require('polka');
const dhost = require('dhost').default;  // or: import dhost from 'dhost';

polka()
  .use(dhost({ /* optional options */}))
  .listen(3000, (err) => {
    // ...
  });
```

# Dependencies

This package has just a handful of dependencies, none of which have further dependencies.

Needed for the middleware only:

* `he` escapes names in generated directory listing
* `mime` guesses mime-types for the `Content-Type` header
* `gumnut` for ESM rewriting support
* `esm-resolve` for resolving imports

Included for the CLI:

* `bytes` displays nicely-formatted download sizes
* `colorette` for color output
* `mri` parses command-line arguments
