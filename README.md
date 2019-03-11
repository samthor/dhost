The never-caching development Node webserver for static files.
This instructs browsers _never_ to cache any requested resources.
If you've ever had to mash _Ctrl/Cmd-R_ to ensure your browser is seeing the latest version of a static site, you'll know this feeling.

Install globally via `npm -g install devserver` or `yarn global add devserver`, then run `devserver`.

⚠️ This is just for development.
Don't use it in any sort of production.

# Running

Run `devserver -h` for flags.
By default, this hosts only on `localhost`, on the first available port 9000 or above, and copies the serving URL to your clipboard.

# Middleware

This can be used as middleware. For instance, to serve the current directory, without caching, inside Polka:

```js
const polka = require('polka');
const devserver = require('devserver');

polka()
  .use(devserver())
  .listen(3000, (err) => {
    // ...
  });
```

# Dependencies

This package has just a handful of direct dependencies.

Included for the middleware only:

* `he`: escapes names in generated directory listing
* `mime`: guesses mime-type for `Content-Type` header

Included for the CLI:

* `bytes`: to display nicely-formatted download sizes
* `chalk`: for color output
* `clipboardy`: copies webserver address to clipboard on start
* `mri`: for parsing command-line arguments
