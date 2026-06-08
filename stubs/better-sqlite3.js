// Stub for web/server-side rendering — WatermelonDB's Node SQLite adapter
// is never used in the browser or React Native; this prevents Metro from
// failing when it statically analyses the sqlite-node bundle path.
module.exports = function Database() {};
