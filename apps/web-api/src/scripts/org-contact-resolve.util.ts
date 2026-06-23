/**
 * Resolve org-bridge contacts to LabOS members at neuro seed time.
 */
import { PrismaClient } from '@prisma/client';
import { loadMemberNameIndex, normalizePersonName, type MemberNameIndex } from './founder-member-resolve.util';

export interface RouteNodeContact {
  name: string;
  role?: string;
  email?: string;
  linkedin?: string;
  telegram?: string;
  memberUid?: string;
  imageUrl?: string;
  affinityId?: string;
  source?: 'gold_list' | 'v8' | 'labos' | 'portfolio' | 'affinity';
}

export interface MemberLabOsProfile {
  uid: string;
  email?: string;
  imageUrl?: string;
  linkedin?: string;
  telegram?: string;
}

export interface RouteNodeLike {
  label: string;
  orgName?: string;
  role?: string;
  email?: string;
  linkedin?: string;
  telegram?: string;
  imageUrl?: string;
  memberUid?: string;
  teamUid?: string;
  logo?: string;
  variant: 'member' | 'external' | 'org';
  contacts?: RouteNodeContact[];
}

export interface OrgConnectorLike {
  name: string;
  description?: string;
  tags?: string[];
  email?: string;
  website?: string;
  teamUid?: string;
  logo?: string;
  contacts?: RouteNodeContact[];
}

export interface MemberContactIndex {
  byEmail: Map<string, MemberLabOsProfile>;
  byUid: Map<string, MemberLabOsProfile>;
  membersByName: MemberNameIndex;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function lookupProfile(
  index: MemberContactIndex,
  input: { memberUid?: string; email?: string; name?: string }
): MemberLabOsProfile | undefined {
  if (input.memberUid) {
    const hit = index.byUid.get(input.memberUid);
    if (hit) return hit;
  }
  const emailKey = normalizeEmail(input.email);
  if (emailKey) {
    const hit = index.byEmail.get(emailKey);
    if (hit) return hit;
  }
  const nameKey = input.name ? normalizePersonName(input.name) : '';
  if (nameKey) {
    const uid = index.membersByName.get(nameKey);
    if (uid) return index.byUid.get(uid);
  }
  return undefined;
}

function mergeProfileIntoContact(contact: RouteNodeContact, profile?: MemberLabOsProfile): RouteNodeContact {
  if (!profile) return contact;
  return {
    ...contact,
    memberUid: profile.uid,
    email: contact.email ?? profile.email,
    imageUrl: contact.imageUrl ?? profile.imageUrl,
    linkedin: contact.linkedin ?? profile.linkedin,
    telegram: contact.telegram ?? profile.telegram,
    source: contact.source ?? 'labos',
  };
}

function syncRouteNodeFromContacts(node: RouteNodeLike, index?: MemberContactIndex): RouteNodeLike {
  const contacts = (node.contacts ?? []).map((c) => (index ? resolveContactLabOs(c, index) : c));
  if (contacts.length === 0) return node;
  const primary = contacts[0];
  return {
    ...node,
    label: primary.name,
    orgName: node.orgName ?? (node.variant === 'org' ? node.label : node.orgName),
    role: primary.role ?? node.role,
    email: primary.email,
    linkedin: primary.linkedin,
    telegram: primary.telegram,
    imageUrl: primary.imageUrl,
    memberUid: primary.memberUid,
    variant: primary.memberUid ? 'member' : 'external',
    contacts,
  };
}

function hydratePersonNode(
  node: RouteNodeLike,
  contact: RouteNodeContact,
  index: MemberContactIndex,
  extra?: { orgName?: string; teamUid?: string }
): RouteNodeLike {
  const resolved = resolveContactLabOs(contact, index);
  return syncRouteNodeFromContacts(
    {
      ...node,
      orgName: extra?.orgName ?? node.orgName,
      teamUid: extra?.teamUid ?? node.teamUid,
      contacts: node.contacts?.length ? node.contacts.map((c) => resolveContactLabOs(c, index)) : [resolved],
    },
    index
  );
}

export interface PersonRouteHydrationContext {
  investor: { firstName: string; lastName: string; memberUid?: string; email?: string; role?: string };
  bridgeContact?: {
    name: string;
    role: string;
    memberUid?: string;
    email?: string;
    linkedin?: string;
    teams?: Array<{ name: string; teamUid?: string }>;
  };
  plConnector?: { name: string };
  plConnectorMemberUid?: string;
}

/** Apply LabOS profile + Affinity email onto every person node in the final route chain. */
export function hydratePersonRouteNodes(
  routeNodes: RouteNodeLike[],
  ctx: PersonRouteHydrationContext,
  index: MemberContactIndex
): RouteNodeLike[] {
  const investorLabel = `${ctx.investor.firstName} ${ctx.investor.lastName}`.trim();
  const investorEmail =
    ctx.investor.email && !ctx.investor.email.endsWith('@lp.local') ? ctx.investor.email : undefined;

  return routeNodes.map((node) => {
    if (node.variant === 'org' && !node.contacts?.length) return node;

    if (node.label === investorLabel) {
      return hydratePersonNode(
        node,
        {
          name: investorLabel,
          role: ctx.investor.role ?? 'Investor',
          email: investorEmail,
          memberUid: ctx.investor.memberUid,
          source: 'affinity',
        },
        index
      );
    }

    if (ctx.plConnector && normalizePersonName(node.label) === normalizePersonName(ctx.plConnector.name)) {
      return hydratePersonNode(
        node,
        {
          name: ctx.plConnector.name,
          role: 'Protocol Labs',
          memberUid: ctx.plConnectorMemberUid,
          source: 'portfolio',
        },
        index
      );
    }

    if (ctx.bridgeContact && normalizePersonName(node.label) === normalizePersonName(ctx.bridgeContact.name)) {
      return hydratePersonNode(
        node,
        {
          name: ctx.bridgeContact.name,
          role: ctx.bridgeContact.role,
          email: ctx.bridgeContact.email,
          linkedin: ctx.bridgeContact.linkedin,
          memberUid: ctx.bridgeContact.memberUid,
          source: 'portfolio',
        },
        index,
        {
          orgName: ctx.bridgeContact.teams?.[0]?.name ?? node.orgName,
          teamUid: ctx.bridgeContact.teams?.[0]?.teamUid ?? node.teamUid,
        }
      );
    }

    if (node.contacts?.length) {
      return syncRouteNodeFromContacts(node, index);
    }

    return hydratePersonNode(
      node,
      { name: node.label, memberUid: node.memberUid, email: node.email, source: 'portfolio' },
      index
    );
  });
}

export interface HopChainForOrgContactResolve {
  contact?: { name: string; role: string; email?: string; linkedin?: string; memberUid?: string };
  orgConnector?: OrgConnectorLike;
  orgConnectors?: OrgConnectorLike[];
  routeNodes?: RouteNodeLike[];
}

/** Hydrate org-bridge contacts with LabOS memberUid + profile image. */
export function enrichOrgConnectorContacts<T extends HopChainForOrgContactResolve>(
  hopChain: T,
  index: MemberContactIndex
): T & HopChainForOrgContactResolve {
  const orgConnectors = (hopChain.orgConnectors ?? (hopChain.orgConnector ? [hopChain.orgConnector] : [])).map(
    (org) => ({
      ...org,
      contacts: enrichContactsList(org.contacts, index),
    })
  );

  let routeNodes = hopChain.routeNodes?.map((node) => {
    const contacts = enrichContactsList(node.contacts, index);
    return syncRouteNodeFromContacts({ ...node, contacts }, index);
  });

  let contact = hopChain.contact;
  const primaryOrg = orgConnectors[0];
  const primaryContact = primaryOrg?.contacts?.[0];
  if (primaryContact) {
    contact = {
      name: primaryContact.name,
      role: primaryContact.role ?? 'Contact',
      email: primaryContact.email,
      linkedin: primaryContact.linkedin,
      memberUid: primaryContact.memberUid,
    };
  } else if (contact) {
    const resolved = resolveContactLabOs(
      {
        name: contact.name,
        role: contact.role,
        email: contact.email,
        linkedin: contact.linkedin,
        memberUid: contact.memberUid,
        source: 'portfolio',
      },
      index
    );
    contact = {
      ...contact,
      memberUid: resolved.memberUid,
      email: resolved.email ?? contact.email,
      linkedin: resolved.linkedin ?? contact.linkedin,
    };
    if (routeNodes?.length) {
      routeNodes = routeNodes.map((n) =>
        normalizePersonName(n.label) === normalizePersonName(contact!.name)
          ? syncRouteNodeFromContacts({ ...n, contacts: [resolved] }, index)
          : n
      );
    }
  }

  return {
    ...hopChain,
    ...(contact ? { contact } : {}),
    ...(orgConnectors.length > 0 ? { orgConnectors, orgConnector: orgConnectors[0] } : {}),
    ...(routeNodes ? { routeNodes } : {}),
  };
}

/** Approved members indexed by email, uid, and unambiguous name. */
export async function loadMemberContactIndex(prisma: PrismaClient): Promise<MemberContactIndex> {
  const members = await prisma.member.findMany({
    where: { memberApproval: { state: 'APPROVED' } },
    select: {
      uid: true,
      name: true,
      email: true,
      linkedinHandler: true,
      telegramHandler: true,
      image: { select: { url: true } },
    },
  });

  const byEmail = new Map<string, MemberLabOsProfile>();
  const byUid = new Map<string, MemberLabOsProfile>();
  for (const m of members) {
    const profile: MemberLabOsProfile = {
      uid: m.uid,
      email: m.email ?? undefined,
      imageUrl: m.image?.url ?? undefined,
      linkedin: m.linkedinHandler ?? undefined,
      telegram: m.telegramHandler ?? undefined,
    };
    byUid.set(m.uid, profile);
    const emailKey = normalizeEmail(m.email);
    if (emailKey) byEmail.set(emailKey, profile);
  }

  const membersByName = await loadMemberNameIndex(prisma);
  return { byEmail, byUid, membersByName };
}

function enrichContactsList(
  contacts: RouteNodeContact[] | undefined,
  index: MemberContactIndex
): RouteNodeContact[] | undefined {
  if (!contacts?.length) return contacts;
  return contacts.map((c) => resolveContactLabOs(c, index));
}

function resolveContactLabOs(contact: RouteNodeContact, index: MemberContactIndex): RouteNodeContact {
  const profile = lookupProfile(index, contact);
  if (profile) return mergeProfileIntoContact(contact, profile);
  return contact;
}
