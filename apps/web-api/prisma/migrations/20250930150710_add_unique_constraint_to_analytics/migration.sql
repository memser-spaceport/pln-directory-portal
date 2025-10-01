ALTER TABLE "Event"
  ADD CONSTRAINT "Event_eventId_userId_key"
    UNIQUE ("eventId", "userId");
