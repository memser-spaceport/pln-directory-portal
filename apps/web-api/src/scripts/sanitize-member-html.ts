/**
 * One-time clean-up of member HTML already stored before LAB-2987: removes
 * script, event-handler and javascript: URL content from Member.bio and
 * MemberExperience.description. New writes are sanitized by PrismaService.
 *
 *   yarn api:sanitize-member-html            # dry-run: lists the rows it would change
 *   yarn api:sanitize-member-html --apply    # writes; run only after a human approved the dry-run
 *
 * Changes stored data, so a human reviews the dry-run output and approves
 * before anyone runs --apply. Only rows with content that can run code are
 * written (with the same sanitizer as new writes); a value with only harmless
 * formatting or a different entity encoding is left as it is. Logs uids and
 * lengths, never the field content. A row edited after it was read is left
 * as it is (its new value was sanitized on write). Safe to rerun.
 *
 * Writes through a plain PrismaClient, so no DB CUD events are emitted for
 * the cleaned rows.
 */
import { PrismaClient } from '@prisma/client';
import { hasUnsafeMemberHtml, sanitizeMemberHtml } from '../members/member-html.util';

const prisma = new PrismaClient();
const BATCH = 500;

async function cleanMembers(apply: boolean): Promise<number> {
  let found = 0;
  let cursor: number | undefined;
  for (;;) {
    const rows = await prisma.member.findMany({
      where: { bio: { not: null } },
      select: { id: true, uid: true, bio: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      if (!hasUnsafeMemberHtml(row.bio)) continue;
      found++;
      const bio = sanitizeMemberHtml(row.bio) as string;
      console.log(`  Member ${row.uid} bio: ${row.bio?.length} -> ${bio.length} chars`);
      // Writes only if the bio did not change since it was read
      if (apply) await prisma.member.updateMany({ where: { uid: row.uid, bio: row.bio }, data: { bio } });
    }
  }
  return found;
}

async function cleanExperiences(apply: boolean): Promise<number> {
  let found = 0;
  let cursor: number | undefined;
  for (;;) {
    const rows = await prisma.memberExperience.findMany({
      where: { description: { not: null } },
      select: { id: true, uid: true, memberUid: true, description: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      if (!hasUnsafeMemberHtml(row.description)) continue;
      found++;
      const description = sanitizeMemberHtml(row.description) as string;
      console.log(
        `  MemberExperience ${row.uid} (member ${row.memberUid}) description: ${row.description?.length} -> ${description.length} chars`
      );
      if (apply) {
        await prisma.memberExperience.updateMany({
          where: { uid: row.uid, description: row.description },
          data: { description },
        });
      }
    }
  }
  return found;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const members = await cleanMembers(apply);
  const experiences = await cleanExperiences(apply);
  console.log(
    apply
      ? `cleaned ${members} member bios and ${experiences} experience descriptions`
      : `dry-run: would clean ${members} member bios and ${experiences} experience descriptions. After approval, rerun with --apply.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
