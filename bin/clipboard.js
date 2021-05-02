
import * as os from 'os';
import * as childProcess from 'child_process';


/**
 * @param {string} arg
 * @return {void}
 */
export let copyToClipboard = (arg) => {
  throw new Error('unimplemented');
};



if (os.platform() === 'darwin') {
  copyToClipboard = (s) => {
    // On macOS, this is really easy.
    childProcess.execSync('pbcopy', {input: s});
  };
} else {
  // @ts-ignore
  import('clipboardy').then((clipboardy) => {
    copyToClipboard = (s) => {
      clipboardy.writeSync(s);
    };
  }).catch((e) => {});
}
