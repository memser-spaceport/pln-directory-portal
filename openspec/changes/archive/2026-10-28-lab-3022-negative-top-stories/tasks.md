## 1. Ranking

- [x] 1.1 `seed-trending` asks for `excludedUids` and drops those UIDs from Top stories and Popular this week
- [x] 1.2 Recency padding and the Protocol Labs force-include skip excluded UIDs
- [x] 1.3 A short list is stored as-is, with a warning
- [x] 1.4 A failed model call does not clear editorial ranks and does not fill from the newest stories

## 2. Tests

- [x] 2.1 Unit tests cover an excluded newest story, an excluded Protocol Labs item, a single editorial rank, and a thrown model call
