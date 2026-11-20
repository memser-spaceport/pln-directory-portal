-- LAB-3343: contact data of an event that only its submitter and a directory admin read
-- (host and co-host emails, the address parts the gathering was resolved from).
ALTER TABLE "PLEvent" ADD COLUMN "privateDetails" JSONB;
