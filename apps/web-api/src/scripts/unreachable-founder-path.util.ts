import { hasFounderNodes, type PathHopChain } from './social-overlap-seed.util';

/**
 * Seed-time filter for founder warm paths that cannot be actioned:
 * no Directory memberUid on the founder contact AND no PL connector person.
 *
 * Existing PathfinderPath rows are unchanged until neuro/gold are reseeded.
 */

export type UnreachableFounderPathInput = {
  connectorType?: string;
  hopChain: PathHopChain;
};

function hasUsablePlConnector(hopChain: PathHopChain): boolean {
  const pl = hopChain.plConnector;
  if (!pl) return false;
  if (pl.memberUid) return true;
  if (pl.internalId != null) return true;
  return !!(pl.name && pl.name.trim());
}

function hasDirectoryFounder(hopChain: PathHopChain): boolean {
  return !!hopChain.contact?.memberUid;
}

/** True when the path is a founder (F) warm path. */
export function isFounderWarmPath(input: UnreachableFounderPathInput): boolean {
  if (input.connectorType === 'F') return true;
  if (hasFounderNodes(input.hopChain)) return true;
  return /^founder$/i.test(input.hopChain.contact?.role ?? '');
}

/**
 * True when a founder warm path has no Directory founder contact and no PL
 * connector person — i.e. Protocol Labs org door + unmatched founder only.
 * Call after Affinity plConnector graft and finalizePersonHopChain.
 */
export function isUnreachableFounderPath(input: UnreachableFounderPathInput): boolean {
  if (!isFounderWarmPath(input)) return false;
  if (hasDirectoryFounder(input.hopChain)) return false;
  if (hasUsablePlConnector(input.hopChain)) return false;
  return true;
}
