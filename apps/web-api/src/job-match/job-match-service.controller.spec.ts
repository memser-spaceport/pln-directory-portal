jest.mock('ai', () => ({ generateText: jest.fn() }));

import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { JobMatchServiceController } from './job-match-service.controller';

describe('JobMatchServiceController', () => {
  const env = { ...process.env };
  const runner = { start: jest.fn() };
  const email = { completedRun: jest.fn(), sendForRun: jest.fn() };
  const controller = new JobMatchServiceController(runner as never, email as never);

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.IS_JOB_MATCH_ENABLED;
    process.env.VERCEL_AI_KEY = 'test-key';
    process.env.ANTHROPIC_AUTH_MODE = 'wif';
    runner.start.mockResolvedValue({ status: 'started', runUid: 'run-1', runDate: '2026-10-09' });
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('starts a run when IS_JOB_MATCH_ENABLED is not true', async () => {
    await expect(controller.run({ teamUids: [' team-1 ', 'team-1'] })).resolves.toMatchObject({ status: 'started' });
    expect(runner.start).toHaveBeenCalledWith(['team-1'], { ignoreEnabledFlag: true });
  });

  it('returns 500 when VERCEL_AI_KEY is missing and the flag is off', async () => {
    delete process.env.VERCEL_AI_KEY;
    await expect(controller.run()).rejects.toThrow(new InternalServerErrorException('VERCEL_AI_KEY missing'));
    expect(runner.start).not.toHaveBeenCalled();
  });

  it('returns 500 when ANTHROPIC_AUTH_MODE is not wif', async () => {
    process.env.ANTHROPIC_AUTH_MODE = 'api_key';
    await expect(controller.run()).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(runner.start).not.toHaveBeenCalled();
  });

  describe('POST job-match/suggested-candidates-email (LAB-2850)', () => {
    const result = { runUid: 'run-9', dryRun: true, sent: 2, skipped: 1 };

    beforeEach(() => {
      email.sendForRun.mockResolvedValue(result);
    });

    it('sends for the latest completed run when the body is empty or missing', async () => {
      email.completedRun.mockResolvedValue({ uid: 'run-9' });
      await expect(controller.sendSuggestedCandidatesEmail({})).resolves.toEqual(result);
      await expect(controller.sendSuggestedCandidatesEmail(undefined)).resolves.toEqual(result);
      expect(email.completedRun).toHaveBeenCalledWith(undefined);
      expect(email.sendForRun).toHaveBeenCalledWith('run-9');
    });

    it('sends for the given completed run', async () => {
      email.completedRun.mockResolvedValue({ uid: 'run-3' });
      await controller.sendSuggestedCandidatesEmail({ runUid: 'run-3' });
      expect(email.completedRun).toHaveBeenCalledWith('run-3');
      expect(email.sendForRun).toHaveBeenCalledWith('run-3');
    });

    it('404s an unknown or unfinished run and sends nothing', async () => {
      email.completedRun.mockResolvedValue(null);
      await expect(controller.sendSuggestedCandidatesEmail({ runUid: 'nope' })).rejects.toBeInstanceOf(
        NotFoundException
      );
      await expect(controller.sendSuggestedCandidatesEmail({})).rejects.toBeInstanceOf(NotFoundException);
      expect(email.sendForRun).not.toHaveBeenCalled();
    });

    it.each([[{ runUid: 42 }], [{ runUid: '' }], ['run-1']])('400s body %p', async (body) => {
      await expect(controller.sendSuggestedCandidatesEmail(body)).rejects.toBeInstanceOf(BadRequestException);
      expect(email.completedRun).not.toHaveBeenCalled();
    });
  });
});
