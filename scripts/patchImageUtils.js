/**
 * Patches @expo/image-utils to use os.tmpdir() instead of the hardcoded
 * '.expo/web/cache/production/images' path for icon processing cache.
 *
 * On EAS Build workers, the .expo/ directory is sometimes restored from a
 * previous failed build with incorrect ownership, causing EACCES when
 * expo prebuild tries to create .expo/web. os.tmpdir() is always writable.
 *
 * Runs automatically via the postinstall npm script after every npm install.
 */
const fs = require('fs');
const path = require('path');

const TARGET = path.join(
  __dirname, '..', 'node_modules', '@expo', 'image-utils', 'build', 'Cache.js'
);
const OLD = "const CACHE_LOCATION = '.expo/web/cache/production/images';";
const NEW =
  "const { tmpdir } = require('os');\n" +
  "const CACHE_LOCATION = require('path').join(tmpdir(), 'expo-image-cache');";

try {
  const content = fs.readFileSync(TARGET, 'utf8');
  if (content.includes(OLD)) {
    fs.writeFileSync(TARGET, content.replace(OLD, NEW));
    console.log('patched @expo/image-utils: icon cache → os.tmpdir()');
  } else if (content.includes('expo-image-cache')) {
    console.log('@expo/image-utils already patched');
  } else {
    console.warn('WARNING: @expo/image-utils Cache.js format has changed — patch not applied');
  }
} catch (e) {
  console.warn('WARNING: could not patch @expo/image-utils:', e.message);
}
