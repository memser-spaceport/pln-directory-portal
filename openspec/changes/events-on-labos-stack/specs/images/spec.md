# Spec Delta

## REMOVED Requirements

### Requirement: Events-service image upload requires the service key

**Reason**: The events service is retired, and it was the only caller of `POST /v1/service/images`.
**Migration**: A member uploads an event image with `POST /v1/images`. A partner app uploads one with `POST /v1/integrations/events/images` (`event-curation-api`).
