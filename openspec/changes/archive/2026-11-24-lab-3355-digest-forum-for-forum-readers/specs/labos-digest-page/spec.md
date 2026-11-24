## MODIFIED Requirements

### Requirement: Forum post bodies need forum access

In the issue read, `forumPosts` SHALL list the issue's forum posts, with each opening post's HTML and author and `locked: false`, only when the reader is a signed-in member with forum read permission (`forum.read`). For any other reader (signed out, a signed-in user who is not a member, a member without `forum.read`, or a failed permission check) `forumPosts` SHALL be empty and `forumUnavailable` false: no title, reply count or forum URL SHALL reach them, and the backend SHALL NOT call the forum for them.

#### Scenario: Signed out

- **GIVEN** issue `iss1` lists forum topic 101
- **WHEN** a reader with no session reads it
- **THEN** `forumPosts` is empty, `forumUnavailable` is false, and the answer has no title of topic 101

#### Scenario: Member without forum access

- **GIVEN** a signed-in member without `forum.read`
- **WHEN** they read `iss1`
- **THEN** `forumPosts` is empty and the answer has no title of topic 101

#### Scenario: Member with forum access

- **GIVEN** a signed-in member with `forum.read`
- **WHEN** they read `iss1`
- **THEN** post 101 has its title, HTML, author and reply count, and `locked: false`
