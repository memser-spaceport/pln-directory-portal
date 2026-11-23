## 1. Location link

- [x] 1.1 `PLEventDetailsSchema`: optional, nullable `locationUrl` (http or https URL); `emptyPLEventDetails` sets null
- [x] 1.2 `mapEventDetails`: read `location_url` (fallback `locationUrl`); store null for any value that is not an http or https URL
- [x] 1.3 `readEventDetails`: copy `locationUrl` from the stored details
- [x] 1.4 Tests: mapper, read-back, both sync paths, the detail response

## 2. Backfill (after merge)

- [ ] 2.1 Run the details-only sync on dev (Oleg)
- [ ] 2.2 Run the details-only sync on prod after release (Oleg)
