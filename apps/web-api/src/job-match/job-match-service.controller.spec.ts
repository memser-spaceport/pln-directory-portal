jest.mock('ai', () => ({ generateText: jest.fn() }));

import { InternalServerErrorException } from '@nestjs/common';
import { JobMatchServiceController } from './job-match-service.controller';

describe('JobMatchServiceController', () => {
  const env = { ...process.env };
  const runner = { start: jest.fn() };
  const controller = new JobMatchServiceController(runner as never);

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
});
