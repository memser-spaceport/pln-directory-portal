-- New apps are open to all PL Infra members by default; existing rows keep
-- their current access.
ALTER TABLE "AiApp" ALTER COLUMN "access" SET DEFAULT 'OPEN';
