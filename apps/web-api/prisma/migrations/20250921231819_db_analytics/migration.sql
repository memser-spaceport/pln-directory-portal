-- Create table
CREATE TABLE IF NOT EXISTS "Event" (
  "id"            TEXT PRIMARY KEY,
  "eventId"       TEXT UNIQUE,
  "eventType"     TEXT NOT NULL,
  "userId"        TEXT,
  "userEmail"     TEXT,
  "anonymousId"   TEXT,
  "sessionId"     TEXT,
  "source"        TEXT,
  "path"          TEXT,
  "referrer"      TEXT,
  "userAgent"     TEXT,
  "requestIp"     TEXT,
  "ts"            TIMESTAMP(3) NOT NULL,
  "receivedAt"    TIMESTAMP(3) NOT NULL DEFAULT now(),
  "props"         JSONB
  );

-- Recommended B-Tree indexes
CREATE INDEX IF NOT EXISTS "Event_eventType_ts_idx"   ON "Event" ("eventType", "ts");
CREATE INDEX IF NOT EXISTS "Event_userId_ts_idx"      ON "Event" ("userId", "ts");
CREATE INDEX IF NOT EXISTS "Event_anonymousId_ts_idx" ON "Event" ("anonymousId", "ts");
CREATE INDEX IF NOT EXISTS "Event_sessionId_ts_idx"   ON "Event" ("sessionId", "ts");
CREATE INDEX IF NOT EXISTS "Event_ts_idx"             ON "Event" ("ts");

