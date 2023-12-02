const fs = require('fs-extra');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const zipper = require('zip-local');

main();

async function main() {
  await exec('npm run build:chrome');

  // Removes non-source files
  const tmpDir = '../tmp';
  if (fs.existsSync(tmpDir)) {
    await fs.rm(tmpDir, { recursive: true });
  }
  await fs.mkdir(tmpDir);
  await fs.copy('.', '../tmp', {
    filter: (src, dest) => {
      if (src.startsWith(`node_modules`) || src.endsWith(`packaged-extension.zip`)) {
        return false;
      } else {
        return true;
      }
    }
  });

  zipper.sync.zip('../tmp').compress().save('extension-source.zip');  

  console.log('Built for Firefox');
}
