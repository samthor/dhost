
const fs = require('fs');
const he = require('he');
const path = require('path');


/**
 * @param {string} filename
 * @param {boolean=} hidden whether to include hidden files
 * @return {!Array<string>} contents of directory
 */
async function directoryContents(filename, hidden=false) {
  let listing = fs.readdirSync(filename);
  if (!hidden) {
    listing = listing.filter((cand) => cand[0] !== '.');
  }

  const s = (cand) => fs.statSync(path.join(filename, cand));
  const stats = await Promise.all(listing.map(s));

  listing = listing.map((cand, i) => {
    const stat = stats[i];
    if (stat.isDirectory()) {
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

    // sort by name
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
