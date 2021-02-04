import * as os from 'os';


export function localAddresses() {
  const interfaces = os.networkInterfaces();
  const all = [];

  for (const ifname of Object.keys(interfaces)) {
    // @ts-ignore
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
 * @param {string} forwardedFor raw X-Forwarded-For header
 * @param {string} address raw network address
 * @return {string[]}
 */
export function mergeForwardedFor(forwardedFor, address) {
  const parts = (forwardedFor || '').split(',').map(formatRemoteAddress).filter((x) => x);
  address = formatRemoteAddress(address);

  if (!address && parts.length) {
    parts.push('localhost');  // should never happen: X-Forwarded-For _and_ localhost?
  } else if (address && parts[parts.length - 1] !== address) {
    parts.push(address);
  }

  return parts;
}


/**
 * @param {string} address to format
 * @return {string} formatted address, or empty for localhost
 */
export function formatRemoteAddress(address) {
  address = address.trim();

  if (address.startsWith('::ffff:')) {
    address = address.substr(7);  // remove IPv4-in-IPv6
  }

  if (address === '::1' || address === '127.0.0.1') {
    return '';  // localhost
  }

  return address;
}
