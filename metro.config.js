const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// For the web/server static-rendering pass, stub out the WatermelonDB SQLite
// adapter entirely. The SQLite adapter depends on native binaries (better-sqlite3
// in Node, expo-sqlite on device) that cannot run during SSR. Stubbing at the
// adapter level prevents the database from ever being initialised during rendering.
const WDB_SQLITE = '@nozbe/watermelondb/adapters/sqlite';
const wdbStub = path.resolve(__dirname, 'stubs/watermelondb-sqlite.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === WDB_SQLITE && platform === 'web') {
    return { type: 'sourceFile', filePath: wdbStub };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
