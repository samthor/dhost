import * as https from 'https';

/**
 * @param {{name: string, version: string}} spec
 */
export default async (spec) => {
  // TODO(samthor): This should use the configured registry, but it works for now.
  const url = `https://registry.npmjs.com/${spec['name']}/latest`;
  const localVersion = spec['version'];
  if (!localVersion) {
    throw new Error('no local version');
  }

  return new Promise((resolve, reject) => {
    /**
     * @param {{version: string}} def
     */
    const handleRemote = (def) => {
      const remoteVersion = def['version'];

      if (remoteVersion.localeCompare(localVersion, 'en', {numeric: true}) > 0) {
        resolve(remoteVersion);
      } else {
        resolve(null);  // nothing to do
      }
    };

    https.get(url, (res) => {
      let raw = '';
    
      if (res.statusCode !== 200) {
        res.resume();  // do nothing
        return reject(res.statusCode);
      }
    
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          const def = JSON.parse(raw);
          handleRemote(def);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
};

