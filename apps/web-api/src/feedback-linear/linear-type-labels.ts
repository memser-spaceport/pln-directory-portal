import { Injectable } from '@nestjs/common';
import { LinearClient } from './linear.client';

const CACHE_TTL_MS = 60 * 60_000;
const TYPE_GROUP_NAME = 'type';

export type LinearTypeName = 'Bug' | 'Feature' | 'Improvement';

/**
 * Finds a team's Type labels (children of the label group named "Type") by
 * name. Labels are cached per team for an hour.
 */
@Injectable()
export class LinearTypeLabels {
  private readonly cache = new Map<string, { at: number; byName: Map<string, string> }>();

  constructor(private readonly linear: LinearClient) {}

  /** The label id, or null when the team has no such Type label. */
  async find(teamId: string, typeName: LinearTypeName, now = Date.now()): Promise<string | null> {
    let entry = this.cache.get(teamId);
    if (!entry || now - entry.at >= CACHE_TTL_MS) {
      const labels = await this.linear.teamLabels(teamId);
      const byName = new Map<string, string>();
      for (const label of labels) {
        if (label.parentName?.trim().toLowerCase() === TYPE_GROUP_NAME) {
          byName.set(label.name.trim().toLowerCase(), label.id);
        }
      }
      entry = { at: now, byName };
      this.cache.set(teamId, entry);
    }
    return entry.byName.get(typeName.toLowerCase()) ?? null;
  }
}
