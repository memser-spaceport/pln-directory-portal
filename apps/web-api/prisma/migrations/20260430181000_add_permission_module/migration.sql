BEGIN;

ALTER TABLE "Permission"
  ADD COLUMN IF NOT EXISTS "module" TEXT;

UPDATE "Permission"
SET "module" = CASE "code"
  WHEN 'admin.tools.access' THEN 'Admin Tool'
  WHEN 'directory.admin.full' THEN 'Directory'
  WHEN 'member.search.read' THEN 'Directory'
  WHEN 'team.search.read' THEN 'Directory'
  WHEN 'team.priority.read' THEN 'Directory'
  WHEN 'membership.source.read' THEN 'Directory'
  WHEN 'member.contacts.read' THEN 'Directory'
  WHEN 'member.onboarding' THEN 'Directory'
  WHEN 'oh.supply.read' THEN 'Office Hours'
  WHEN 'oh.supply.write' THEN 'Office Hours'
  WHEN 'oh.demand.read' THEN 'Office Hours'
  WHEN 'oh.demand.write' THEN 'Office Hours'
  WHEN 'forum.read' THEN 'Forum'
  WHEN 'forum.write' THEN 'Forum'
  WHEN 'irlg.going.read' THEN 'IRL Gatherings'
  WHEN 'irlg.going.write' THEN 'IRL Gatherings'
  WHEN 'deals.read' THEN 'Deals'
  WHEN 'deals.view' THEN 'Deals'
  WHEN 'founder_guides.view' THEN 'Founder Guides'
  WHEN 'founder_guides.view.plvs' THEN 'Founder Guides'
  WHEN 'founder_guides.view.plcc' THEN 'Founder Guides'
  WHEN 'founder_guides.view.all' THEN 'Founder Guides'
  WHEN 'founder_guides.create' THEN 'Founder Guides'
  WHEN 'demoday.prep.read' THEN 'PL Demo Day'
  WHEN 'demoday.prep.write' THEN 'PL Demo Day'
  WHEN 'demoday.showcase.read' THEN 'PL Demo Day'
  WHEN 'demoday.showcase.write' THEN 'PL Demo Day'
  WHEN 'demoday.active.read' THEN 'PL Demo Day'
  WHEN 'demoday.active.write' THEN 'PL Demo Day'
  WHEN 'demoday.stats.read' THEN 'PL Demo Day'
  WHEN 'demo_day.report_link.view' THEN 'PL Demo Day'
  WHEN 'pl.advisors.access' THEN 'PL Advisors'
  ELSE "module"
END;

DO $$
DECLARE
  unmapped_codes TEXT;
BEGIN
  SELECT string_agg("code", ', ' ORDER BY "code")
  INTO unmapped_codes
  FROM "Permission"
  WHERE "module" IS NULL;

  IF unmapped_codes IS NOT NULL THEN
    RAISE EXCEPTION 'Unmapped permission modules for codes: %', unmapped_codes;
  END IF;
END $$;

ALTER TABLE "Permission"
  ALTER COLUMN "module" SET NOT NULL;

COMMIT;
