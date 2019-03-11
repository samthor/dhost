The never-caching development Node webserver for static files.
This instructs browsers _never_ to cache any requested resources.
If you've ever had to mash _Ctrl/Cmd-R_ to ensure your browser is seeing the latest version of a static site, you'll know this feeling.

Install globally via `npm -g install dhost` or `yarn global add dhost`, then run `dhost`.

⚠️ This is just for development.
Don't use it in any sort of production.

# Magic

The goal of this server is not to surprise you, and to avoid magic where possible.
Its behvaior will never intentionally match any particular hosting platform's semantics.

Here are the exceptions:

* We serve `index.html` if found, or generate a simple directory listing otherwise
* Symlinks generate a 302 to their target file if it's within the root (serve contents instead via flag)
* No data is served for other status codes (i.e., your browser will render its own 404 page)

# Running

Run `dhost -h` for flags.
By default, this hosts only on `localhost`, on the first available port 9000 or above, and copies the serving URL to your clipboard.

# Middleware

This can be used as middleware. To serve the current directory—without caching—with Polka:

```js
const polka = require('polka');
const dhost = require('dhost');

polka()
  .use(dhost({ /* optional options */}))
  .listen(3000, (err) => {
    // ...
  });
```

# Dependencies

This package has just a handful of direct dependencies.

Needed for the middleware only:

* `he` escapes names in generated directory listing
* `mime` guesses mime-types for the `Content-Type` header

Included for the CLI:

* `bytes` displays nicely-formatted download sizes
* `chalk` for color output
* `clipboardy` copies webserver address to clipboard on start
* `mri` parses command-line arguments
