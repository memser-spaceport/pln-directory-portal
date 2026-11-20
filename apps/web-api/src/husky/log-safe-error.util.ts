/**
 * The log form of a model or store error: `{ name, statusCode, message }` only (LAB-3362, contract 11.4).
 *
 * An AI SDK `APICallError` holds `requestBodyValues`, the full prompt with the page context and the intro card text.
 * Winston copies every field of an error object into the log line. So a catch in the Husky path logs this string, never
 * the error object.
 */
export function logSafeError(error: unknown): string {
  const fields = (error ?? {}) as { name?: unknown; statusCode?: unknown; message?: unknown };
  const isObject = typeof error === 'object' && error !== null;
  return JSON.stringify({
    name: isObject && typeof fields.name === 'string' ? fields.name : typeof error,
    statusCode: isObject && typeof fields.statusCode === 'number' ? fields.statusCode : undefined,
    message: isObject && typeof fields.message === 'string' ? fields.message : String(error),
  });
}
