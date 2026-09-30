import { BadRequestException, HttpException } from '@nestjs/common';
import { LogException } from './log-exception.filter';

jest.mock('axios', () => ({ __esModule: true, default: { isAxiosError: () => false } }));

describe('LogException', () => {
  function run(exception: unknown) {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    new LogException().catch(exception, host as never);
    return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
  }

  it('keeps a reason from an object response', () => {
    expect(run(new HttpException({ reason: 'ALREADY_APPLIED' }, 409)).body).toEqual({
      statusCode: 409,
      message: 'ALREADY_APPLIED',
      reason: 'ALREADY_APPLIED',
    });
  });

  it('keeps a message from an object response', () => {
    expect(run(new HttpException({ message: 'This spotlight is closed' }, 409)).body).toEqual({
      statusCode: 409,
      message: 'This spotlight is closed',
    });
  });

  it('leaves built-in exceptions unchanged', () => {
    expect(run(new BadRequestException('Member not found')).body).toEqual({
      statusCode: 400,
      message: 'Member not found',
    });
  });
});
