const path = require('path');

module.exports = {
  client: {
    service: {
      localSchemaFile: path.resolve(__dirname, './apps/web-api/schema.gql'),
      endpoint: null,
    },
    includes: ['apps/**/*.{ts,tsx,js,jsx,graphql}'],
  },
};
