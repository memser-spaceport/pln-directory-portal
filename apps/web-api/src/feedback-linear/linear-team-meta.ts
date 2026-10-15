import { Injectable } from '@nestjs/common';
import { FeedbackLinearPermanentError } from './feedback-linear-handlers';
import { LinearClient, LinearTeamDetails } from './linear.client';

const CACHE_TTL_MS = 60 * 60_000;
const TYPE_GROUP_NAME = 'type';

export type LinearTypeName = 'Bug' | 'Feature' | 'Improvement';

/**
 * A team's states and labels, cached per team for an hour, with the lookups
 * feedback pushes need: the intake state, the first completed/canceled state,
 * and labels by name.
 */
@Injectable()
export class LinearTeamMeta {
  private readonly cache = new Map<string, { at: number; team: LinearTeamDetails }>();

  constructor(private readonly linear: LinearClient) {}

  /** The team, or a permanent error when the Linear app can't see it. */
  async get(teamId: string, now = Date.now()): Promise<LinearTeamDetails> {
    const cached = this.cache.get(teamId);
    if (cached && now - cached.at < CACHE_TTL_MS) {
      return cached.team;
    }
    const team = await this.linear.team(teamId);
    if (!team) {
      throw new FeedbackLinearPermanentError(`Linear team ${teamId} not found or not shared with the Linear app`);
    }
    this.cache.set(teamId, { at: now, team });
    return team;
  }

  /**
   * Where new feedback lands: the triage state when triage is on, otherwise
   * the first backlog state by position. Never a Todo or started state.
   */
  async intakeStateId(teamId: string): Promise<string> {
    const team = await this.get(teamId);
    if (team.triageEnabled) {
      const triage = firstOfType(team, 'triage');
      if (triage) return triage;
    }
    const backlog = firstOfType(team, 'backlog');
    if (!backlog) {
      throw new FeedbackLinearPermanentError(`Linear team ${team.key} has no triage or backlog state`);
    }
    return backlog;
  }

  async stateIdOfType(teamId: string, type: 'completed' | 'canceled'): Promise<string> {
    const team = await this.get(teamId);
    const state = firstOfType(team, type);
    if (!state) {
      throw new FeedbackLinearPermanentError(`Linear team ${team.key} has no ${type} state`);
    }
    return state;
  }

  /** The team's Type label (child of the "Type" group) with this name, or null. */
  async typeLabelId(teamId: string, name: LinearTypeName): Promise<string | null> {
    const team = await this.get(teamId);
    const wanted = name.toLowerCase();
    const label = team.labels.find(
      (l) => l.parentName?.trim().toLowerCase() === TYPE_GROUP_NAME && l.name.trim().toLowerCase() === wanted
    );
    return label?.id ?? null;
  }

  /** A label with this name, preferring a top-level one, or null. */
  async labelId(teamId: string, name: string): Promise<string | null> {
    const team = await this.get(teamId);
    const wanted = name.trim().toLowerCase();
    const matches = team.labels.filter((l) => l.name.trim().toLowerCase() === wanted);
    return (matches.find((l) => !l.parentName) ?? matches[0])?.id ?? null;
  }
}

function firstOfType(team: LinearTeamDetails, type: string): string | null {
  const states = team.states.filter((state) => state.type === type).sort((a, b) => a.position - b.position);
  return states[0]?.id ?? null;
}
