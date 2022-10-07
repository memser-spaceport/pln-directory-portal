const webpack = require('webpack');

module.exports = {
  entry: [`${__dirname}/web3-file-retrieval.js`],
  output: { filename: 'web3-file-retrieval.min.js' },
  mode: 'production',
  resolve: {
    modules: ['node_modules'],
    fallback: {
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
    },
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
  ],
};
