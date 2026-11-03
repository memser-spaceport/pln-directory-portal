## 1. Investor lists API

- [x] 1.1 Add `SpvSpotlightInvestorList` and `SpvSpotlightInvestorListParticipant` with a migration
- [x] 1.2 Add `CreateSpvInvestorListSchema` to the SPV spotlight contracts
- [x] 1.3 Add `SpvSpotlightInvestorListsService` with list, create and delete
- [x] 1.4 Add `GET`, `POST` and `DELETE` under `/v1/admin/spv-spotlights/:uid/investor-lists`
- [x] 1.5 Tests cover dedupe, non-investor participants, duplicate names and deletes scoped to the spotlight
