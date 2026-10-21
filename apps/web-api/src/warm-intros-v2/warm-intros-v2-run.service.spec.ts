import { WarmIntrosV2RunService } from './warm-intros-v2-run.service';

describe('WarmIntrosV2RunService.claim', () => {
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const create = jest.fn();
  const service = new WarmIntrosV2RunService({
    warmIntrosV2Run: { findFirst, updateMany, create },
  } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips when a run lock is still fresh', async () => {
    findFirst.mockResolvedValueOnce({ uid: 'live' });
    await expect(service.claim(new Date('2026-10-21T05:00:00Z'))).resolves.toEqual({
      action: 'skipped',
      uid: 'live',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('takes over a stale running row', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ uid: 'stale' });
    updateMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.claim(new Date('2026-10-21T05:00:00Z'))).resolves.toEqual({
      action: 'run',
      uid: 'stale',
    });
  });

  it('starts a run when nothing is locked', async () => {
    findFirst.mockResolvedValue(null);
    create.mockResolvedValueOnce({ uid: 'new' });
    await expect(service.claim(new Date('2026-10-21T05:00:00Z'))).resolves.toEqual({
      action: 'run',
      uid: 'new',
    });
  });

  it('skips when another start wins the running row', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ uid: 'winner' });
    create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(service.claim(new Date('2026-10-21T05:00:00Z'))).resolves.toEqual({
      action: 'skipped',
      uid: 'winner',
    });
  });
});
