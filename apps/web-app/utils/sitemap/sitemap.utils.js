module.exports = {
  /**
   * Get site URL based on environment and previewURL
   *
   * @param {string} [environment]
   * @param {string} [previewURL]
   * @return {string}
   */
  getSiteUrl: function (environment, previewURL) {
    return environment === 'production'
      ? 'https://plnetwork.io'
      : previewURL
      ? `https://${previewURL}`
      : 'http://localhost:4200';
  },
};
