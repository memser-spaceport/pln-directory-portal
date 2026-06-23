import zodToJsonSchema from 'zod-to-json-schema';
import type { AppRoute } from '@ts-rest/core';

/**
 * Derives OpenAPI schema fragments (parameters / requestBody / responses) from a
 * ts-rest `AppRoute` contract. The contracts in `libs/contracts` already carry the
 * full Zod definitions, so this lets the Swagger document reflect real request and
 * response shapes without per-endpoint decorators.
 *
 * Mirrors the conversion options used by `src/decorators/api-response-from-zod.ts`
 * (`openApi3` target, inlined `$ref`s).
 */

const toJsonSchema = (zodSchema: any): any => zodToJsonSchema(zodSchema, { target: 'openApi3', $refStrategy: 'none' });

const isZodSchema = (value: any): boolean => !!value && typeof value._def === 'object';

export interface OperationSchemaFragments {
  summary?: string;
  description?: string;
  parameters: any[];
  requestBody?: any;
  responses: Record<string, any>;
}

/** Extract `:param` placeholders from a ts-rest path. */
function pathParamNames(path: string): string[] {
  return (path.match(/:([A-Za-z0-9_]+)/g) ?? []).map((p) => p.slice(1));
}

function buildQueryParameters(appRoute: AppRoute): any[] {
  const query = (appRoute as any).query;
  if (!isZodSchema(query)) return [];

  const json = toJsonSchema(query);
  const properties: Record<string, any> = json?.properties ?? {};
  const required: string[] = json?.required ?? [];

  return Object.entries(properties).map(([name, schema]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema,
  }));
}

function buildPathParameters(appRoute: AppRoute): any[] {
  const pathParams = (appRoute as any).pathParams;
  const json = isZodSchema(pathParams) ? toJsonSchema(pathParams) : undefined;
  const properties: Record<string, any> = json?.properties ?? {};

  return pathParamNames(appRoute.path).map((name) => ({
    name,
    in: 'path',
    required: true, // path params are always required
    schema: properties[name] ?? { type: 'string' },
  }));
}

function buildRequestBody(appRoute: AppRoute): any | undefined {
  if (appRoute.method === 'GET') return undefined;
  const body = (appRoute as any).body;
  if (!isZodSchema(body)) return undefined;

  return {
    required: true,
    content: {
      'application/json': { schema: toJsonSchema(body) },
    },
  };
}

function buildResponses(appRoute: AppRoute): Record<string, any> {
  const responses: Record<string, any> = {};
  const contractResponses: Record<string, any> = (appRoute as any).responses ?? {};

  for (const [status, schema] of Object.entries(contractResponses)) {
    const response: any = { description: '' };
    if (isZodSchema(schema)) {
      response.content = { 'application/json': { schema: toJsonSchema(schema) } };
    }
    responses[status] = response;
  }
  return responses;
}

export function buildOperationFromAppRoute(appRoute: AppRoute): OperationSchemaFragments {
  return {
    summary: (appRoute as any).summary,
    description: (appRoute as any).description,
    parameters: [...buildPathParameters(appRoute), ...buildQueryParameters(appRoute)],
    requestBody: buildRequestBody(appRoute),
    responses: buildResponses(appRoute),
  };
}
