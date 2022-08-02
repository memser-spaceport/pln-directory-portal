# Infinite Scroll

_This feature was temporarily disabled due to Airtable limitations._

### How does it work?

- `getTeamsDirectoryRequestParametersFromQuery` on `list.utils.ls` helps getting the query parameters to be used on the infinite scroll API Route requests
- `getTeamsDirectoryRequestOptionsFromQuery` on `list.utils.ls` helps getting the options for the first page request, using the Airtable's Javascript SDK
- `getFirstTeamPage` method from Airtable lib, which retrieves the first X teams, is used on the `/teams` page's `getServerSideProps` instead of `getTeams` (which retrieves all teams at once)
- `useInfiniteScroll` hook adds infinite scroll logic to the directory list component

### How to make it work again?

- Use `getFirstTeamPage` method from Airtable lib on the `/teams` page's `getServerSideProps` instead of `getTeams`
- Add `pageSize` property back into `getTeamsDirectoryRequestOptionsFromQuery` so that we can request a sub-set of the whole resultset, in a paginated fashion
- Show `DirectoryLoading` component within `TeamsDirectoryList`, when `loading` is set to `true`
- Show `DirectoryError` component within `TeamsDirectoryList`, when `error` is set to `true`
- Use `useInfiniteScroll` hook to manage `TeamsDirectoryList` state

### What's the problem?

The `offset` property retrieved by Airtable along with the data for each page contains a token that gets invalidated after a short period of inactivity.
This means that, if a user leaves a Protocol Labs Network Directory page open for some time, he will get an error requesting the next infinite scroll page, due to token invalidation.

### What can be done to fix it?

- When Airtable response has an `error` property, and `error.type` is equal to `'LIST_RECORDS_ITERATOR_NOT_AVAILABLE'`:
  - We need to save the next item ID from the previous token before getting a new token
  - We then need to make a new request for the first page of results, using the same exact criteria
  - When we get a response, we need to look at the `offset` property from the returned data and get a new token from it (the substring before `'/'`)
  - The new offset will then be: `<new_token>/<next_item_id>`
  - We then make a new request using the same criteria, but the new offset
- We may consider using the bottom of the last card instead the middle of the card for improved user experience
- We need to reset the `loading` and the `error` states on router change
- The scroll event listeners should occur after the route change events
