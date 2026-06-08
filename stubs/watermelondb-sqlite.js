// No-op SQLiteAdapter stub for web/server static rendering.
// WatermelonDB SQLite cannot run in a browser or Node SSR context.
// This stub prevents the static renderer from trying to open a database.
function SQLiteAdapter() {}
SQLiteAdapter.prototype.testClone = function () { return new SQLiteAdapter(); };

module.exports = SQLiteAdapter;
module.exports.default = SQLiteAdapter;
