-- Migration: Restructure Focus Areas - Neurotech & AI/Robotics
-- Wrapped in DO block so subqueries returning NULL (e.g. on empty shadow DB) are safe.

DO $$
DECLARE
  v_ai_robotics_uid TEXT;
  v_neurotech_uid TEXT;
  v_wbe_uid TEXT;
BEGIN
  -- ============================================================
  -- Step 1: Rename "Develop Advanced Technologies" → "AI & Robotics"
  -- ============================================================
  UPDATE "FocusArea"
  SET "title" = 'AI & Robotics', "updatedAt" = NOW()
  WHERE "title" = 'Develop Advanced Technologies';

  -- ============================================================
  -- Step 2: Promote existing Neurotech to top-level (parentUid = NULL)
  -- If it doesn't exist, create it.
  -- ============================================================
  UPDATE "FocusArea"
  SET "parentUid" = NULL, "updatedAt" = NOW()
  WHERE "title" = 'Neurotech';

  INSERT INTO "FocusArea" ("uid", "title", "description", "createdAt", "updatedAt", "parentUid")
  VALUES ('cl-fa-neurotech', 'Neurotech', '', NOW(), NOW(), NULL)
  ON CONFLICT ("title") DO NOTHING;

  -- Resolve UIDs (may be NULL on shadow DB if no seed data)
  SELECT "uid" INTO v_ai_robotics_uid FROM "FocusArea" WHERE "title" = 'AI & Robotics';
  SELECT "uid" INTO v_neurotech_uid FROM "FocusArea" WHERE "title" = 'Neurotech';

  -- ============================================================
  -- Step 3: Clean up old FocusAreaHierarchy where Neurotech was
  -- a child of AI & Robotics
  -- ============================================================
  IF v_neurotech_uid IS NOT NULL AND v_ai_robotics_uid IS NOT NULL THEN
    DELETE FROM "FocusAreaHierarchy"
    WHERE "subFocusAreaUid" = v_neurotech_uid
      AND "focusAreaUid" = v_ai_robotics_uid;
  END IF;

  -- ============================================================
  -- Step 4: Insert "Robotics" under "AI & Robotics"
  -- ============================================================
  IF v_ai_robotics_uid IS NOT NULL THEN
    INSERT INTO "FocusArea" ("uid", "title", "description", "createdAt", "updatedAt", "parentUid")
    VALUES ('cl-fa-robotics', 'Robotics', '', NOW(), NOW(), v_ai_robotics_uid)
    ON CONFLICT ("title") DO NOTHING;

    INSERT INTO "FocusAreaHierarchy" ("focusAreaUid", "subFocusAreaUid", "isDirect")
    SELECT v_ai_robotics_uid, "uid", true
    FROM "FocusArea" WHERE "title" = 'Robotics'
    AND NOT EXISTS (
      SELECT 1 FROM "FocusAreaHierarchy"
      WHERE "focusAreaUid" = v_ai_robotics_uid
        AND "subFocusAreaUid" = (SELECT "uid" FROM "FocusArea" WHERE "title" = 'Robotics')
    );
  END IF;

  -- ============================================================
  -- Step 5: Insert 12 Neurotech sub-categories + hierarchy entries
  -- ============================================================
  IF v_neurotech_uid IS NOT NULL THEN
    -- 5a: Insert sub-category FocusArea records
    INSERT INTO "FocusArea" ("uid", "title", "description", "createdAt", "updatedAt", "parentUid")
    VALUES
      ('cl-fa-whole-brain-emulation', 'Whole Brain Emulation', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-brain-preservation', 'Brain Preservation', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-brain-computer-interface', 'Brain-Computer Interface', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-computational-neuroscience', 'Computational Neuroscience / NeuroAI', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-connectomics', 'Connectomics', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-neuro-policy', 'Neuro Policy', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-neuroprosthetics', 'Neuroprosthetics and Rehabilitation', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-neurostimulation', 'Neurostimulation and Neuromodulation', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-philanthropic-funding', 'Philanthropic funding', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-venture-funding', 'Venture funding', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-human-like-ai', 'Human-like AI', '', NOW(), NOW(), v_neurotech_uid),
      ('cl-fa-neural-augmentation', 'Neural augmentation', '', NOW(), NOW(), v_neurotech_uid)
    ON CONFLICT ("title") DO NOTHING;

    -- 5b: Insert hierarchy entries for each sub-category under Neurotech
    INSERT INTO "FocusAreaHierarchy" ("focusAreaUid", "subFocusAreaUid", "isDirect")
    SELECT v_neurotech_uid, sub."uid", true
    FROM "FocusArea" sub
    WHERE sub."title" IN (
      'Whole Brain Emulation',
      'Brain Preservation',
      'Brain-Computer Interface',
      'Computational Neuroscience / NeuroAI',
      'Connectomics',
      'Neuro Policy',
      'Neuroprosthetics and Rehabilitation',
      'Neurostimulation and Neuromodulation',
      'Philanthropic funding',
      'Venture funding',
      'Human-like AI',
      'Neural augmentation'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "FocusAreaHierarchy" fah
      WHERE fah."focusAreaUid" = v_neurotech_uid
        AND fah."subFocusAreaUid" = sub."uid"
    );

    -- ============================================================
    -- Step 6: Remap teams from old Neurotech sub-category
    -- to "Whole Brain Emulation" under new Neurotech top-level
    -- ============================================================
    SELECT "uid" INTO v_wbe_uid FROM "FocusArea" WHERE "title" = 'Whole Brain Emulation';

    IF v_wbe_uid IS NOT NULL THEN
      -- 6a: Insert ancestor row: focusAreaUid=WBE, ancestorAreaUid=Neurotech
      INSERT INTO "TeamFocusArea" ("teamUid", "focusAreaUid", "ancestorAreaUid")
      SELECT tfa."teamUid", v_wbe_uid, v_neurotech_uid
      FROM "TeamFocusArea" tfa
      WHERE tfa."focusAreaUid" = v_neurotech_uid
        AND tfa."ancestorAreaUid" = tfa."focusAreaUid"
      ON CONFLICT ("focusAreaUid", "teamUid", "ancestorAreaUid") DO NOTHING;

      -- Create self-reference row: focusAreaUid=WBE, ancestorAreaUid=WBE
      INSERT INTO "TeamFocusArea" ("teamUid", "focusAreaUid", "ancestorAreaUid")
      SELECT tfa."teamUid", v_wbe_uid, v_wbe_uid
      FROM "TeamFocusArea" tfa
      WHERE tfa."focusAreaUid" = v_neurotech_uid
        AND tfa."ancestorAreaUid" = tfa."focusAreaUid"
      ON CONFLICT ("focusAreaUid", "teamUid", "ancestorAreaUid") DO NOTHING;

      -- 6b: Delete old TeamFocusArea rows where focusAreaUid = Neurotech
      DELETE FROM "TeamFocusArea"
      WHERE "focusAreaUid" = v_neurotech_uid;
    END IF;
  END IF;
END $$;
