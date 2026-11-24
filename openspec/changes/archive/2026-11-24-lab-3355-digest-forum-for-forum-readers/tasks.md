## 1. Backend

- [x] 1.1 `readIssue`: call the forum only for a viewer with `canReadForum`; otherwise no posts and not unavailable
- [x] 1.2 Remove `lockForumPost`; note in the contract that `locked` is always false
- [x] 1.3 Service specs: signed out and no access get `forumPosts: []`, no title in the answer, no forum call; with access, the posts in full
- [x] 1.4 Mutation check: give everyone the forum and see the new tests fail

## 2. Ship

- [x] 2.1 Archive this change in the backend PR
