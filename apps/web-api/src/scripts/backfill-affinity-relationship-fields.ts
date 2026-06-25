/**
 * Backfill AffinityPerson relationship card columns from rawFields + listMemberships.
 * Use after migration when a full enrichment re-run is not yet available.
 *
 *   DATABASE_URL=... npx ts-node apps/web-api/src/scripts/backfill-affinity-relationship-fields.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  dbTierFromApi,
  extractLastContactFromRawFields,
  extractOwnerFromListMemberships,
  computeFrequencyTierFromSignals,
} from '../affinity/affinity-relationship.mapper';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const persons = await prisma.affinityPerson.findMany({
    include: { listMemberships: true },
  });

  let updated = 0;
  for (const person of persons) {
    const owner =
      person.relationshipOwnerName
        ? null
        : extractOwnerFromListMemberships(person.listMemberships, person.keyContact);
    const lastContact =
      person.lastContactSummary
        ? null
        : extractLastContactFromRawFields(person.rawFields);

    const touchpoints6m = person.touchpoints6m ?? 0;
    const frequencyTier =
      person.frequencyTier ??
      dbTierFromApi(
        computeFrequencyTierFromSignals({
          touchpoints6m,
          lastContactAt: person.lastContactAt ?? lastContact?.date ?? null,
        }),
      );

    if (!owner && !lastContact && person.relationshipOwnerName) continue;

    await prisma.affinityPerson.update({
      where: { uid: person.uid },
      data: {
        ...(owner
          ? {
              relationshipOwnerName: owner.name,
              relationshipOwnerEmail: owner.email ?? null,
              relationshipOwnerAffinityPersonId: owner.affinity_person_id ?? null,
            }
          : {}),
        ...(lastContact
          ? {
              lastContactSummary: lastContact.summary,
              lastContactMethod: lastContact.method,
            }
          : {}),
        ...(frequencyTier && !person.frequencyTier ? { frequencyTier } : {}),
      },
    });
    updated += 1;
  }

  console.log(`Backfilled relationship fields on ${updated}/${persons.length} persons`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
