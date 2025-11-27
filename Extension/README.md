# Wandering ProgressTracker

Tracks Wandering Inn progress.

## Build instructions

### Requirements:

- NodeJS: `20.10.0` or later
- NPM: `10.2.3` or later

Built on Windows 10 22H2 (but should work on any system).

### Instructions

```bash
npm install
npm run build:firefox

# The bundled extension will be in /Extension as packaged-extension.zip, and the source code
# in extension-source.zip.
```

### Running locally

 - Run `npm run watch` from the Extensions folder to get rebuilding-on-file changes
 - Run `npx web-ext run` from the Extensions folder to get a Firefox instance with the extension installed, and reloading-on-file changes.