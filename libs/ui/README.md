# UI Library

> A UI library is a collection of related presentational components. There are generally no services injected into these components (all of the data they need should come from Inputs). ([source](https://nx.dev/more-concepts/library-types))

This shared UI library is an essential tool for improving our UI-based components' reusability, consistency, and maintainability. By using such a library, we can create new applications more quickly and with less effort.

### Benefits

1. **Consistency:** One of the primary benefits of this shared UI library is that it ensures consistency across multiple applications. Because all components are created using the same guidelines, there is less room for error, and the user experience is more predictable.

2. **Reusability:** By having this shared UI library, we can reuse existing components instead of having to create new ones from scratch. It saves time, effort and reduces the risk of errors. Components can be easily customized to fit the specific needs of each application, without having to start from scratch each time.

3. **Maintainability:** This shared UI library makes it easier to maintain the codebase of different applications. If there is a bug or issue with a component, a single update to the shared library can fix the issue for all applications. This is more efficient than having to fix the same issue in multiple places, which can be time-consuming and error-prone.

## Example

### Tooltip Component

A tooltip is a common UI component that can be part of a shared UI library. Here is an example of how a tooltip component could be used in an application:

```jsx
<Tooltip trigger={args.trigger} content={args.content} />
```

The Tooltip component can be easily incorporated into any application without having to be created from scratch, saving time and effort, as well as ensuring consistency. The component can be customized to fit the specific needs of the application, without having to start from scratch each time.

## Running unit tests

To ensure the quality and reliability of the UI library, it is important to run unit tests on the components. This can be done using the `nx test ui` command, which will execute the unit tests via [Jest](https://jestjs.io).
