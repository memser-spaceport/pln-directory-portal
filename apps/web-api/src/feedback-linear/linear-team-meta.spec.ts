import { FeedbackLinearPermanentError } from './feedback-linear-handlers';
import { LinearTeamDetails } from './linear.client';
import { LinearTeamMeta } from './linear-team-meta';

// A factory keeps Jest from loading axios's ESM build.
jest.mock('axios', () => ({ create: jest.fn(() => ({ post: jest.fn() })) }));

function team(overrides: Partial<LinearTeamDetails> = {}): LinearTeamDetails {
  return {
    id: 't',
    key: 'ABC',
    name: 'Alpha',
    private: true,
    triageEnabled: false,
    states: [
      { id: 'todo', type: 'unstarted', position: 0 },
      { id: 'icebox', type: 'backlog', position: 2 },
      { id: 'backlog', type: 'backlog', position: 1 },
      { id: 'triage', type: 'triage', position: 0 },
      { id: 'doing', type: 'started', position: 0 },
      { id: 'done', type: 'completed', position: 1 },
      { id: 'shipped', type: 'completed', position: 0 },
      { id: 'canceled', type: 'canceled', position: 0 },
    ],
    labels: [
      { id: 'bug', name: 'Bug', parentName: 'Type' },
      { id: 'severity-bug', name: 'Bug', parentName: 'QA severity' },
      { id: 'improvement', name: 'Improvement', parentName: 'type ' },
      { id: 'uf-child', name: 'User feedback', parentName: 'Source' },
      { id: 'uf', name: 'User Feedback', parentName: null },
    ],
    projects: [],
    ...overrides,
  };
}

describe('LinearTeamMeta', () => {
  let linear: { team: jest.Mock };
  let meta: LinearTeamMeta;

  beforeEach(() => {
    linear = { team: jest.fn().mockResolvedValue(team()) };
    meta = new LinearTeamMeta(linear as never);
  });

  describe('intake state', () => {
    it('is the first backlog state by position when triage is off', async () => {
      await expect(meta.intakeStateId('t')).resolves.toBe('backlog');
    });

    it('is the triage state when triage is on', async () => {
      linear.team.mockResolvedValue(team({ triageEnabled: true }));
      await expect(meta.intakeStateId('t')).resolves.toBe('triage');
    });

    it('falls back to backlog when triage is on but there is no triage state', async () => {
      const t = team({ triageEnabled: true });
      linear.team.mockResolvedValue({ ...t, states: t.states.filter((s) => s.type !== 'triage') });
      await expect(meta.intakeStateId('t')).resolves.toBe('backlog');
    });

    it('never uses Todo or a started state: no backlog is a permanent error', async () => {
      linear.team.mockResolvedValue(
        team({
          states: [
            { id: 'todo', type: 'unstarted', position: 0 },
            { id: 'doing', type: 'started', position: 0 },
          ],
        })
      );
      const error = await meta.intakeStateId('t').catch((e) => e);
      expect(error).toBeInstanceOf(FeedbackLinearPermanentError);
      expect(error.message).toBe('Linear team ABC has no triage or backlog state');
    });
  });

  it('picks the first completed and canceled states by position', async () => {
    await expect(meta.stateIdOfType('t', 'completed')).resolves.toBe('shipped');
    await expect(meta.stateIdOfType('t', 'canceled')).resolves.toBe('canceled');
  });

  it('errors permanently when the team has no state of the type', async () => {
    linear.team.mockResolvedValue(team({ states: [{ id: 'b', type: 'backlog', position: 0 }] }));
    await expect(meta.stateIdOfType('t', 'canceled')).rejects.toBeInstanceOf(FeedbackLinearPermanentError);
  });

  it('finds Type labels only under the Type group, ignoring case and spaces', async () => {
    await expect(meta.typeLabelId('t', 'Bug')).resolves.toBe('bug');
    await expect(meta.typeLabelId('t', 'Improvement')).resolves.toBe('improvement');
    await expect(meta.typeLabelId('t', 'Feature')).resolves.toBeNull();
  });

  it('finds a label by name, preferring a top-level one', async () => {
    await expect(meta.labelId('t', 'user feedback')).resolves.toBe('uf');
    await expect(meta.labelId('t', 'Missing')).resolves.toBeNull();
  });

  it('errors permanently when the app cannot see the team', async () => {
    linear.team.mockResolvedValue(null);
    await expect(meta.get('t')).rejects.toBeInstanceOf(FeedbackLinearPermanentError);
  });

  it('caches a team for an hour', async () => {
    await meta.get('t', 0);
    await meta.get('t', 59 * 60_000);
    expect(linear.team).toHaveBeenCalledTimes(1);
    await meta.get('t', 60 * 60_000);
    expect(linear.team).toHaveBeenCalledTimes(2);
  });

  it('does not cache a missing team', async () => {
    linear.team.mockResolvedValueOnce(null).mockResolvedValueOnce(team());
    await meta.get('t', 0).catch(() => undefined);
    await expect(meta.get('t', 1)).resolves.toMatchObject({ key: 'ABC' });
  });
});
