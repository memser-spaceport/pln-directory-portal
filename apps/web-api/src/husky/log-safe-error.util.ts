/**
 * The log form of a model or store error: `{ name, statusCode, message }` only (LAB-3362, contract 11.4).
 *
 * An AI SDK `APICallError` holds `requestBodyValues`, the full prompt with the page context and the intro card text.
 * Winston copies every field of an error object into the log line. So a catch in the Husky path logs this string, never
 * the error object.
 *
 * Some AI SDK errors put the model input into `message` itself: `AI_InvalidToolArgumentsError` (the tool args, for
 * example a `draft_intro` text), `AI_TypeValidationError` (the value) and `AI_JSONParseError` (the text). For these, the
 * log form has only `name`, plus `toolName` when it is one of `knownToolNames` (the tools the caller gave the model).
 * The error's own `toolName` comes from the model, so the log never copies a name that is not in that list.
 */
const INPUT_IN_MESSAGE_ERRORS = new Set([
  'AI_InvalidToolArgumentsError',
  'AI_TypeValidationError',
  'AI_JSONParseError',
]);

export function logSafeError(error: unknown, knownToolNames: readonly string[] = []): string {
  const fields = (error ?? {}) as { name?: unknown; statusCode?: unknown; message?: unknown; toolName?: unknown };
  const isObject = typeof error === 'object' && error !== null;
  const name = isObject && typeof fields.name === 'string' ? fields.name : typeof error;
  if (isObject && INPUT_IN_MESSAGE_ERRORS.has(name)) {
    const toolName = knownToolNames.find((known) => known === fields.toolName);
    return JSON.stringify({ name, toolName });
  }
  return JSON.stringify({
    name,
    statusCode: isObject && typeof fields.statusCode === 'number' ? fields.statusCode : undefined,
    message: isObject && typeof fields.message === 'string' ? fields.message : String(error),
  });
}
