import type { PriorBackingFlags } from './prior-backing.types';

/** Boost scalar for blendGraphScore — PL prior backers rank warmer. */
export function backingWarmthBoost(flags: PriorBackingFlags | null | undefined): number {
  if (!flags) return 0;
  let boost = 0;
  if (flags.backedProtocolLabs) boost = 0.65;
  if (flags.backedFilecoin) boost = Math.min(1, boost + 0.1);
  return boost;
}

export function appendBackingNote(explanation: string | undefined, flags: PriorBackingFlags): string {
  const parts: string[] = [];
  if (flags.backedProtocolLabs) parts.push('Prior Protocol Labs investor');
  if (flags.backedFilecoin) parts.push('Filecoin ecosystem investor');
  const note = parts.join('; ');
  const base = (explanation ?? '').trim();
  if (!note) return base;
  if (base.toLowerCase().includes(note.toLowerCase())) return base;
  return base ? `${base} ${note}.` : `${note}.`;
}

export function applyPriorBackingToHopChain(
  hopChain: Record<string, unknown>,
  flags: PriorBackingFlags | null | undefined
): Record<string, unknown> {
  if (!flags) return hopChain;
  const hc: Record<string, unknown> = { ...hopChain, priorBacking: flags };
  const existing = typeof hc.explanation === 'string' ? hc.explanation : undefined;
  hc.explanation = appendBackingNote(existing, flags);
  return hc;
}
