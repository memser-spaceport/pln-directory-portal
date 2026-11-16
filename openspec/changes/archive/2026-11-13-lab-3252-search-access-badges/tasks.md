# Tasks

## 1. LAB-3252: admin access fields on search results

- [x] 1.1 Add optional `accessLevel`, `memberState` and `isJobAspirant` to `SearchResultItemSchema`.
- [x] 1.2 Add `SearchService.addAdminAccessFields` (team access level, member approval state with `PENDING` default, Job Aspirant flag) for teams, members and top results.
- [x] 1.3 Call it in `getFullTextSearchResults` only when the caller has `directory.admin.full`.
- [x] 1.4 Add controller and service specs for admin, non-admin and signed-out callers.
