import { PrismaClient } from '@prisma/client';

export const AFFINITY_FOUNDER_EXPORT_LISTS = [
  { listId: 155463, file: '_affinity_155463.json', name: 'Portfolio Founders' },
  { listId: 281646, file: '_affinity_281646.json', name: 'Strategic Founders' },
] as const;

export type AffinityFounderListExport = {
  meta: { id: number; name: string; type: 'person'; exportedFrom: 'AffinityPerson' };
  entries: Array<{
    id: number;
    listId: number;
    entity: {
      id: number | string;
      firstName: string | null;
      lastName: string | null;
      primaryEmailAddress: string | null;
      emailAddresses: string[];
      type: 'person';
      fields: Array<{ id: string; name: string; value: { data: unknown } }>;
    };
  }>;
};

export type AffinityFoundersExport = {
  lists: Array<{ file: string; payload: AffinityFounderListExport }>;
};

export async function loadAffinityFounderList(
  prisma: PrismaClient,
  listId: number,
  listName: string,
): Promise<AffinityFounderListExport> {
  const memberships = await prisma.affinityListMembership.findMany({
    where: { affinityListId: listId, personUid: { not: null } },
    include: { person: true },
  });

  const entries = memberships
    .filter((m) => m.person)
    .map((m) => {
      const p = m.person!;
      const fields: Array<{ id: string; name: string; value: { data: unknown } }> = [];
      if (p.currentOrganizationName) {
        fields.push({
          id: 'affinity-data-current-organization',
          name: 'Current Organization',
          value: { data: { name: p.currentOrganizationName } },
        });
      }
      if (p.currentJobTitle) {
        fields.push({
          id: 'affinity-data-current-job-title',
          name: 'Current Job Title',
          value: { data: p.currentJobTitle },
        });
      }
      if (p.linkedinUrl) {
        fields.push({
          id: 'affinity-data-linkedin-url',
          name: 'LinkedIn URL',
          value: { data: p.linkedinUrl },
        });
      }

      return {
        id: m.affinityListEntryId,
        listId,
        entity: {
          id: Number(p.affinityPersonId) || p.affinityPersonId,
          firstName: p.firstName,
          lastName: p.lastName,
          primaryEmailAddress: p.primaryEmail,
          emailAddresses: p.emailAddresses?.length ? p.emailAddresses : p.primaryEmail ? [p.primaryEmail] : [],
          type: 'person' as const,
          fields,
        },
      };
    });

  return {
    meta: { id: listId, name: listName, type: 'person', exportedFrom: 'AffinityPerson' },
    entries,
  };
}

export async function loadAffinityFoundersExport(prisma: PrismaClient): Promise<AffinityFoundersExport> {
  const lists: AffinityFoundersExport['lists'] = [];
  for (const list of AFFINITY_FOUNDER_EXPORT_LISTS) {
    lists.push({
      file: list.file,
      payload: await loadAffinityFounderList(prisma, list.listId, list.name),
    });
  }
  return { lists };
}
