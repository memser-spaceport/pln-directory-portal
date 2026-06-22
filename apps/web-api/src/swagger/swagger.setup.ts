import { INestApplication, Logger } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { patchNestjsSwagger } from '@abitia/zod-dto';
import { patchNestJsSwagger } from 'nestjs-zod';
import { DocAudience, SECURITY_SCHEMES, SWAGGER_DOCS, DEFAULT_AUDIENCE } from './swagger.constants';
import { buildRouteMetaMap, RouteMeta } from './route-audience.util';
import { buildOperationFromAppRoute } from './tsrest-schema.util';

const logger = new Logger('Swagger');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

/** Derive a human tag from a controller class name, e.g. `MemberController` → `Member`. */
function deriveTag(operationId: string): string {
  const controllerName = operationId.split('_')[0] ?? operationId;
  return controllerName
    .replace(/Controller$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
}

/**
 * Merge ts-rest-derived parameters into an operation without clobbering parameters
 * Nest already produced (it auto-adds bare path params). Existing entries win, except
 * a path param that has no schema is upgraded with the contract's schema.
 */
function mergeParameters(existing: any[], derived: any[]): any[] {
  const byKey = new Map<string, any>();
  for (const p of existing) byKey.set(`${p.in}:${p.name}`, p);
  for (const p of derived) {
    const key = `${p.in}:${p.name}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, p);
    } else if (!current.schema && p.schema) {
      current.schema = p.schema;
    }
  }
  return [...byKey.values()];
}

/** Fill request/response schemas, security and tags onto a single operation in place. */
function enrichOperation(operation: any, meta: RouteMeta | undefined): void {
  const audience = meta?.audience ?? DEFAULT_AUDIENCE;

  // 1. Schemas from the ts-rest contract — only fill what's missing so manual
  //    @ApiOkResponseFromZod / @ApiBodyFromZod / @ApiQueryFromZod decorators win.
  if (meta?.appRoute) {
    const fragments = buildOperationFromAppRoute(meta.appRoute);

    if (fragments.parameters.length) {
      operation.parameters = mergeParameters(operation.parameters ?? [], fragments.parameters);
    }
    if (!operation.requestBody && fragments.requestBody) {
      operation.requestBody = fragments.requestBody;
    }
    if (fragments.responses && Object.keys(fragments.responses).length) {
      operation.responses = operation.responses ?? {};
      for (const [status, response] of Object.entries(fragments.responses)) {
        const current = operation.responses[status];
        if (!current || !current.content) {
          // keep any description Nest already set; add the contract's content/schema
          operation.responses[status] = { ...response, ...(current ?? {}), content: response.content };
        }
      }
    }
    if (!operation.summary && fragments.summary) operation.summary = fragments.summary;
    if (!operation.description && fragments.description) operation.description = fragments.description;
  }

  // 2. Security: attach the audience's scheme when the route is guarded.
  if (meta?.requiresAuth && (!operation.security || !operation.security.length)) {
    operation.security = [{ [SECURITY_SCHEMES[audience]]: [] }];
  }

  // 3. Tags: keep existing @ApiTags; otherwise fall back to the controller name.
  if (!operation.tags || !operation.tags.length) {
    operation.tags = [deriveTag(operation.operationId ?? '')];
  }
}

/**
 * Splits the full OpenAPI document into one document per audience, enriching each
 * operation with contract schemas, security requirements and tags along the way.
 */
function splitByAudience(
  document: OpenAPIObject,
  routeMeta: Map<string, RouteMeta>
): Record<DocAudience, OpenAPIObject> {
  const buckets: Record<DocAudience, Record<string, any>> = {
    [DocAudience.USER]: {},
    [DocAudience.ADMIN]: {},
    [DocAudience.INTERNAL]: {},
  };
  const usedTags: Record<DocAudience, Set<string>> = {
    [DocAudience.USER]: new Set(),
    [DocAudience.ADMIN]: new Set(),
    [DocAudience.INTERNAL]: new Set(),
  };
  const unclassified: string[] = [];

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const [key, value] of Object.entries(pathItem as Record<string, any>)) {
      if (!HTTP_METHODS.includes(key as any)) continue;

      const operation = value;
      const meta = routeMeta.get(operation.operationId);
      const audience = meta?.audience ?? DEFAULT_AUDIENCE;
      if (!meta) unclassified.push(`${key.toUpperCase()} ${path} (${operation.operationId})`);

      enrichOperation(operation, meta);
      for (const tag of operation.tags ?? []) usedTags[audience].add(tag);

      const bucket = buckets[audience];
      if (!bucket[path]) {
        bucket[path] = {};
        // preserve any path-level (non-method) keys such as shared `parameters`
        for (const [k, v] of Object.entries(pathItem as Record<string, any>)) {
          if (!HTTP_METHODS.includes(k as any)) bucket[path][k] = v;
        }
      }
      bucket[path][key] = operation;
    }
  }

  if (unclassified.length) {
    logger.warn(
      `${unclassified.length} operation(s) had no guard classification and defaulted to the ${DEFAULT_AUDIENCE} doc:\n  ` +
        unclassified.join('\n  ')
    );
  }

  const result = {} as Record<DocAudience, OpenAPIObject>;
  for (const cfg of SWAGGER_DOCS) {
    result[cfg.audience] = {
      ...document,
      info: { ...document.info, title: cfg.title, description: cfg.description },
      paths: buckets[cfg.audience],
      tags: [...usedTags[cfg.audience]].sort().map((name) => ({ name })),
    };
  }
  return result;
}

/**
 * Builds and serves three audience-scoped Swagger documents (User / Admin / Internal).
 * Endpoints are classified automatically from their guards and enriched with schemas
 * from the ts-rest contracts — no per-controller annotation required.
 */
export function setupSwagger(app: INestApplication): void {
  // Render zod DTO classes (admin/back-office controllers) — the two patches compose,
  // each falling through to the other for unrecognised types.
  patchNestjsSwagger();
  patchNestJsSwagger();

  const config = new DocumentBuilder()
    .setTitle('Protocol Labs Directory API')
    .setDescription('The Protocol Labs Directory API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Member access token' },
      SECURITY_SCHEMES[DocAudience.USER]
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Directory admin access token' },
      SECURITY_SCHEMES[DocAudience.ADMIN]
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
        description: 'Service secret, e.g. "Basic <INTERNAL_SERVICE_SECRET>"',
      },
      SECURITY_SCHEMES[DocAudience.INTERNAL]
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
    deepScanRoutes: true,
  });

  const routeMeta = buildRouteMetaMap(app);
  const documents = splitByAudience(document, routeMeta);

  for (const cfg of SWAGGER_DOCS) {
    const doc = documents[cfg.audience];
    SwaggerModule.setup(cfg.path, app, doc);
    logger.log(`Serving "${cfg.title}" at /${cfg.path} (${Object.keys(doc.paths).length} paths)`);
  }
}
