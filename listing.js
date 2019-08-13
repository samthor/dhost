
const fs = require('fs');
const he = require('he');
const helper = require('./helper.js');
const path = require('path');


/**
 * @param {string} filename
 * @param {boolean=} hidden whether to include hidden files
 * @return {!Array<string>} contents of directory
 */
async function directoryContents(filename, hidden=false) {
  let listing = await new Promise((resolve, reject) => {
    fs.readdir(filename, (err, files) => err ? reject(err) : resolve(files));
  });
  if (!hidden) {
    listing = listing.filter((cand) => cand[0] !== '.');
  }

  const s = (cand) => {
    const target = path.join(filename, cand);
    return helper.statOrNull(target);
  };
  const stats = await Promise.all(listing.map(s));

  listing = listing.map((cand, i) => {
    const stat = stats[i];
    if (stat && stat.isDirectory()) {
      return cand + '/';  // don't use path.sep, HTTP servers are always /
    }
    return cand;
  });

  listing.sort((a, b) => {
    const dirA = a[a.length - 1] === '/';
    const dirB = b[b.length - 1] === '/';

    // place subdirs first
    if (dirA !== dirB) {
      if (dirA) {
        return -1;
      } else {
        return +1;
      }
    }

    // sort by name (Node does this on Linux but it's not guaranteed)
    if (a[0] < b[0]) {
      return -1;
    } else if (a[0] > b[0]) {
      return +1;
    }
    return 0;
  });

  return listing;
}


/**
 * @param {string} filename to readdir on
 * @param {string} rel requested HTTP path
 * @return {string} generated HTML for directory listing
 */
module.exports = async (filename, rel) => {
  const contents = await directoryContents(filename);

  if (rel !== '/') {
    contents.unshift('..');
  }

  const links = contents.map((pathname) => {
    const escaped = escape(pathname);
    const encoded = he.encode(pathname);
    return `<li><a href="${escaped}">${encoded}</a></li>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<title>${he.encode(rel)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="google" content="notranslate" />
<style>
body {
  font-family: Helvetica, Arial, Sans-Serif;
  background: white;
  color: black;
  line-height: 1.25em;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
a {
  display: block;
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
</style>
</head>
<body>
<h1>${rel}</h1>
<ul>${links}</ul>
</body>
</html>`;
};
