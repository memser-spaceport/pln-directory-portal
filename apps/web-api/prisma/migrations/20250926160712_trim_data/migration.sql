-- Migration: Trim whitespace from string fields
-- Description: Remove leading and trailing spaces from role and experience fields
-- Tables affected: MemberExperience, ProjectContribution, TeamMemberRole

-- Update MemberExperience.title (remove leading/trailing spaces)
UPDATE "MemberExperience"
SET title = TRIM(title)
WHERE title != TRIM(title);

-- Update MemberExperience.company (remove leading/trailing spaces)
UPDATE "MemberExperience"
SET company = TRIM(company)
WHERE company != TRIM(company);

-- Update ProjectContribution.role (remove leading/trailing spaces)
UPDATE "ProjectContribution"
SET role = TRIM(role)
WHERE role IS NOT NULL
  AND role != TRIM(role);

-- Update TeamMemberRole.role (remove leading/trailing spaces)
UPDATE "TeamMemberRole"
SET role = TRIM(role)
WHERE role IS NOT NULL
  AND role != TRIM(role);
