-- Add name-only auto-link method (lower confidence than rec/email/domain).
ALTER TYPE "AffinityEntityLinkMethod" ADD VALUE 'NAME' BEFORE 'MANUAL';
 