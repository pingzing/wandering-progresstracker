const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');
const sveltePreprocess = require('svelte-preprocess');

main();

async function main() {
  const commonConfig = {
    outbase: './src',
    platform: 'browser',
    external: [],
    bundle: true,
    sourcemap: true,
    minify: false,
    tsconfig: './tsconfig.json',
  };

  const contentJob = (await esbuild.context({
    ...commonConfig,
    entryPoints: ['./src/content.ts'],
    outfile: './dist/content.js'
  })).watch();

  const backgroundJob = (await esbuild.context({
    ...commonConfig,
    entryPoints: ['./src/background.ts'],
    outfile: './dist/background.js'
  })).watch();

  const popupJob = (await esbuild.context({
    ...commonConfig,
    entryPoints: ['./src/popup/popup.ts'],
    outbase: './src/popup',
    outdir: './dist',
    mainFields: ['svelte', 'module', 'main', 'browser'],
    plugins: [
      sveltePlugin({
        preprocess: sveltePreprocess()
      })
    ]
  })).watch();

  const settingsJob = (await esbuild.context({
    ...commonConfig,
    entryPoints: ['./src/settings/settings.ts'],
    outbase: './src/settings',
    outdir: './dist',
    mainFields: ['svelte', 'module', 'main', 'browser'],
    plugins: [
      sveltePlugin({
        preprocess: sveltePreprocess()
      })
    ]
  })).watch();

  const onboardingJob = (await esbuild.context({
    ...commonConfig,
    entryPoints: ['./src/onboarding/onboarding.ts'],
    outbase: './src/onboarding',
    outdir: './dist',
    mainFields: ['svelte', 'module', 'main', 'browser'],
    plugins: [
      sveltePlugin({
        preprocess: sveltePreprocess()
      })
    ]
  })).watch();
  

  await Promise.all([contentJob, backgroundJob, popupJob, settingsJob, onboardingJob]);
  console.log('⚡ Watching...');
}
