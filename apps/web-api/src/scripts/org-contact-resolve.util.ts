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
  source?: 'gold_list' | 'v8' | 'labos' | 'portfolio';
}

export interface RouteNodeLike {
  label: string;
  orgName?: string;
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
  byEmail: Map<string, { uid: string; imageUrl?: string }>;
  membersByName: MemberNameIndex;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function resolveContactLabOs(contact: RouteNodeContact, index: MemberContactIndex): RouteNodeContact {
  if (contact.memberUid) return contact;

  const emailKey = normalizeEmail(contact.email);
  if (emailKey) {
    const hit = index.byEmail.get(emailKey);
    if (hit) {
      return {
        ...contact,
        memberUid: hit.uid,
        imageUrl: hit.imageUrl ?? contact.imageUrl,
        source: 'labos',
      };
    }
  }

  const byName = index.membersByName.get(normalizePersonName(contact.name));
  if (byName) {
    let imageUrl: string | undefined;
    for (const entry of index.byEmail.values()) {
      if (entry.uid === byName) {
        imageUrl = entry.imageUrl;
        break;
      }
    }
    return {
      ...contact,
      memberUid: byName,
      imageUrl: imageUrl ?? contact.imageUrl,
      source: 'labos',
    };
  }

  return contact;
}

function enrichContactsList(
  contacts: RouteNodeContact[] | undefined,
  index: MemberContactIndex
): RouteNodeContact[] | undefined {
  if (!contacts?.length) return contacts;
  return contacts.map((c) => resolveContactLabOs(c, index));
}

function syncRouteNodeFromContacts(node: RouteNodeLike): RouteNodeLike {
  const contacts = node.contacts ?? [];
  if (contacts.length === 0) return node;
  const primary = contacts[0];
  return {
    ...node,
    label: primary.name,
    orgName: node.orgName ?? (node.variant === 'org' ? node.label : node.orgName),
    memberUid: primary.memberUid,
    variant: primary.memberUid ? 'member' : 'external',
    contacts,
  };
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
    return syncRouteNodeFromContacts({ ...node, contacts });
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
    };
    if (routeNodes?.length) {
      routeNodes = routeNodes.map((n, i) =>
        i === 0 || n.label === contact!.name ? syncRouteNodeFromContacts({ ...n, contacts: [resolved] }) : n
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

/** Approved members indexed by email and unambiguous name. */
export async function loadMemberContactIndex(prisma: PrismaClient): Promise<MemberContactIndex> {
  const members = await prisma.member.findMany({
    where: { memberApproval: { state: 'APPROVED' } },
    select: {
      uid: true,
      name: true,
      email: true,
      image: { select: { url: true } },
    },
  });

  const byEmail = new Map<string, { uid: string; imageUrl?: string }>();
  for (const m of members) {
    const emailKey = normalizeEmail(m.email);
    if (emailKey) {
      byEmail.set(emailKey, { uid: m.uid, imageUrl: m.image?.url ?? undefined });
    }
  }

  const membersByName = await loadMemberNameIndex(prisma);
  return { byEmail, membersByName };
}
