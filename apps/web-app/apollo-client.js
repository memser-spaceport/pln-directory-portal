import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:3000/graphql',
  cache: new InMemoryCache(),
  client: {
    service: {
      name: 'my-graphql-app',
      url: 'http://localhost:3000/graphql',
    },
  },
});

export default client;
