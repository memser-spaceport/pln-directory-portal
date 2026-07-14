/**
 * Read-time fill of LabOS profile photos onto hopChain people for the investor
 * drawer Paths section. Seed often stores memberUid without imageUrl.
 */

interface PersonWithImage {
  memberUid?: string;
  imageUrl?: string;
}

interface HopChainLike {
  contact?: PersonWithImage;
  routeNodes?: Array<
    PersonWithImage & {
      contacts?: PersonWithImage[];
    }
  >;
}

function needsImage(person: PersonWithImage | undefined): boolean {
  return !!person?.memberUid && !person.imageUrl;
}

/** Collect memberUids that need an imageUrl filled from LabOS. */
export function collectMemberUidsNeedingImages(hopChains: unknown[]): string[] {
  const uids = new Set<string>();
  for (const raw of hopChains) {
    if (!raw || typeof raw !== 'object') continue;
    const hc = raw as HopChainLike;
    if (needsImage(hc.contact) && hc.contact?.memberUid) uids.add(hc.contact.memberUid);
    for (const node of hc.routeNodes ?? []) {
      if (needsImage(node) && node.memberUid) uids.add(node.memberUid);
      for (const c of node.contacts ?? []) {
        if (needsImage(c) && c.memberUid) uids.add(c.memberUid);
      }
    }
  }
  return [...uids];
}

function withImage<T extends PersonWithImage>(person: T, imagesByUid: Map<string, string>): T {
  if (!needsImage(person) || !person.memberUid) return person;
  const imageUrl = imagesByUid.get(person.memberUid);
  return imageUrl ? { ...person, imageUrl } : person;
}

/** Shallow-clone hopChain filling missing imageUrl from the uid→url map. */
export function hydrateHopChainImages(hopChain: unknown, imagesByUid: Map<string, string>): unknown {
  if (!hopChain || typeof hopChain !== 'object' || imagesByUid.size === 0) return hopChain;
  const hc = hopChain as HopChainLike;

  const contact = hc.contact ? withImage(hc.contact, imagesByUid) : hc.contact;
  const routeNodes = hc.routeNodes?.map((node) => {
    const next = withImage(node, imagesByUid);
    if (!node.contacts?.length) return next;
    return { ...next, contacts: node.contacts.map((c) => withImage(c, imagesByUid)) };
  });

  if (contact === hc.contact && routeNodes === hc.routeNodes) return hopChain;
  return {
    ...hc,
    ...(contact !== undefined ? { contact } : {}),
    ...(routeNodes ? { routeNodes } : {}),
  };
}
