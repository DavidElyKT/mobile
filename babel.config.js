module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Decorators and class-properties are already handled by babel-preset-expo
    // via @react-native/babel-preset (transform-class-properties loose:true) and
    // plugin-proposal-decorators legacy:true. Adding them manually here caused a
    // double-transform conflict that made Hermes throw "Cannot assign to read-only
    // property 'NONE'" on startup.
    overrides: [
      {
        test: /\.tsx?$/,
        plugins: [
          ['@babel/plugin-transform-typescript', { allowDeclareFields: true }],
        ],
      },
    ],
  };
};
