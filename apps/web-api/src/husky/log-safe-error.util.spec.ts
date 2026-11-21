import { AISDKError, APICallError, JSONParseError, TypeValidationError } from '@ai-sdk/provider';
import { logSafeError } from './log-safe-error.util';

const SECRET = 'Secret-draft-5e1f: I lead fundraising at Acme.';

/** As `InvalidToolArgumentsError` in ai 4.0.19 (dist/index.js): the cause message, with the args, is in `message`. */
function invalidToolArgsError(toolName: string, toolArgs: string, cause: { message: string }) {
  return Object.assign(
    new AISDKError({
      name: 'AI_InvalidToolArgumentsError',
      message: `Invalid arguments for tool ${toolName}: ${cause.message}`,
      cause,
    }),
    { toolName, toolArgs }
  );
}

describe('logSafeError (LAB-3362)', () => {
  it('keeps name, statusCode and message of an APICallError, and drops requestBodyValues', () => {
    const error = new APICallError({
      message: 'Overloaded',
      url: 'https://api.example.com/v1/messages',
      requestBodyValues: { prompt: SECRET },
      statusCode: 529,
    });
    expect(logSafeError(error)).toBe('{"name":"AI_APICallError","statusCode":529,"message":"Overloaded"}');
  });

  it('logs only the name of a TypeValidationError and a JSONParseError, because the message has the input', () => {
    const typeError = new TypeValidationError({ value: { type: 'person', text: SECRET }, cause: new Error('bad') });
    const jsonError = new JSONParseError({ text: `{"text":"${SECRET}"`, cause: new Error('bad') });
    expect(typeError.message).toContain(SECRET);
    expect(jsonError.message).toContain(SECRET);

    expect(logSafeError(typeError)).toBe('{"name":"AI_TypeValidationError"}');
    expect(logSafeError(jsonError)).toBe('{"name":"AI_JSONParseError"}');
  });

  it('logs the toolName of an InvalidToolArgumentsError only when it is a known tool of the call', () => {
    const args = JSON.stringify({ type: 'person', text: SECRET });
    const known = invalidToolArgsError('draft_intro', args, new Error(args));
    const unknown = invalidToolArgsError('draft_intro_x', args, new Error(args));
    expect(known.message).toContain(SECRET);

    expect(logSafeError(known, ['searchWeb', 'draft_intro'])).toBe(
      '{"name":"AI_InvalidToolArgumentsError","toolName":"draft_intro"}'
    );
    expect(logSafeError(known)).toBe('{"name":"AI_InvalidToolArgumentsError"}');
    expect(logSafeError(unknown, ['draft_intro'])).toBe('{"name":"AI_InvalidToolArgumentsError"}');
  });

  it('logs a plain error and a non-error value', () => {
    expect(logSafeError(new Error('write failed'))).toBe('{"name":"Error","message":"write failed"}');
    expect(logSafeError('boom')).toBe('{"name":"string","message":"boom"}');
  });
});
