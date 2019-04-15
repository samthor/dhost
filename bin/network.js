const os = require('os');


function localAddresses() {
  const interfaces = os.networkInterfaces();
  const all = [];

  for (const ifname of Object.keys(interfaces)) {
    for (const iface of interfaces[ifname]) {
      // hide internal or link-local v6
      if (iface.internal || iface.address.startsWith('fe80::')) {
        continue;
      }
      all.push({address: iface.address, family: iface.family});
    }
  }

  all.sort((a, b) => {
    if (a.family < b.family) {
      return -1;
    } else if (a.family > b.family) {
      return +1;
    }
    return 0;  // stable sort
  });

  return all;
}


/**
 * @param {string} address to format
 * @return {?string} formatted address, or null for localhost
 */
function formatRemoteAddress(address) {
  if (address.startsWith('::ffff:')) {
    address = address.substr(7);  // remove IPv4-in-IPv6
  }

  if (address === '::1' || address === '127.0.0.1') {
    return null;  // localhost
  }

  return address;
}


module.exports = {
  localAddresses,
  formatRemoteAddress,
};
