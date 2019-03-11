The never-caching development Node webserver for static files.

Install globally `npm -g install devserver` or `yarn global add devserver`, then run `devserver`.

⚠️ This is just for development.
Don't use it in any sort of production.

Importantly, this instructs browsers _never_ to cache any requested resources.
If you've ever had to mash _Ctrl/Cmd-R_ to ensure your browser is seeing the latest version of a static site, you'll know this feeling.

# Flags

Run `devserver -h` for flags.
By default, this hosts only on `localhost` and copies the serving URL to clipboard.

# Middleware

TODO: can be used as middleware

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
