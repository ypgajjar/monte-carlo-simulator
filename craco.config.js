// craco.config.js
module.exports = {
    webpack: {
      configure: (webpackConfig) => {
        webpackConfig.resolve.fallback = {
          crypto: require.resolve("crypto-browserify"),
          stream: require.resolve("stream-browserify"),
          buffer: require.resolve("buffer/"),
          vm: require.resolve("vm-browserify"),
          assert: require.resolve("assert"),
          os: require.resolve("os-browserify/browser"),
          path: require.resolve("path-browserify"),
        };
        return webpackConfig;
      },
    },
  };
  