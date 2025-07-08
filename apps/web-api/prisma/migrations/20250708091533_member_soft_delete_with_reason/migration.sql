-- AlterTable
ALTER TABLE public."Member"
ADD COLUMN "deletedAt" timestamp(3),
ADD COLUMN "deletionReason" text;

UPDATE public."Member"
SET
  "deletedAt" = NOW(),
  "deletionReason" = 'Your application to join the Protocol Labs network was not approved. You may reapply in the future.'
WHERE "accessLevel" = 'Rejected';
