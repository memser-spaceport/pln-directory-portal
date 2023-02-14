# Data-access libraries

> A data-access library contains code for interacting with a back-end system. It also includes all the code related to state management. ([source](https://nx.dev/more-concepts/library-types))

Data-access libraries help accessing and managing data more efficiently. They provide a unified, reusable, and simplified interface to communicate with server tier APIs, while reducing the development time. The more granular data-access libraries are, the more effective nx affected and Nx’s computation cache will be.

## Example

### Members data-access library

Member data-access library provides a simple and efficient way to retrieve member information from our web API: the `getMember` method.

```jsx
export const getMember = async (
  id: string,
  options: TGetRequestOptions = {}
) => {
  return await client.members.getMember({
    params: { uid: id },
    query: options,
  });
};
```

By using the `getMember` method from the member data-access library, we don’t need to be concerned with the underlying complexities of the data source, such as the workings of the ts-rest client — we simply need to provide it with the ID for the user we’re getting data from.

We can also provide it a different set of options to query the back-end, or we can even set additional default query options to be included in any request for a member’s data.

The library abstracts the complexity and provides a unified interface to access the data, making it easier to retrieve member information.
