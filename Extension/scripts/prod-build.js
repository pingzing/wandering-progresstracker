const fs = require('fs/promises');
const fsExtra = require('fs-extra');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

main();

async function main() {
  if (fsExtra.existsSync('./dist')) {
    await fs.rm('./dist', { recursive: true });
  }
  await fs.mkdir('./dist');
  await exec('npm run build -- --prod');
  console.log('Done');
}
