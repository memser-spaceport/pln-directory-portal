-- AI Apps: track which starter-kit version produced each app's last agent
-- upload (deploy or draft registration), as reported by the kit itself.
-- NULL = pre-1.4 kit (the field didn't exist yet) or a non-kit upload.

ALTER TABLE "AiApp" ADD COLUMN IF NOT EXISTS "kitVersion" TEXT;
