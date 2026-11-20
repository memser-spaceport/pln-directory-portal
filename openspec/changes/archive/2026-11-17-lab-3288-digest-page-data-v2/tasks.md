## 1. Page data v2

- [x] 1.1 Add `teamLogoUrl`, `followsTeam`, `sources`, `commentCount` to the story schema and `isTeamMember`, `nextSendAt` to the page schema
- [x] 1.2 Read the team logo, the member's team follows, feed comment counts and active team roles in `LabosDigestPageService.read`
- [x] 1.3 Add `nextDigestSendAt` mirroring the notification service crons
- [x] 1.4 Unit tests for the new fields and the schedule; check the queries on a real Postgres
