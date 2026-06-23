import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
import { TsRestAppRouteMetadataKey } from '@ts-rest/nest';
import type { AppRoute } from '@ts-rest/core';
import { AUDIENCE_PRIORITY, DEFAULT_AUDIENCE, DocAudience, GUARD_AUDIENCE } from './swagger.constants';

export interface RouteMeta {
  /** Which document the operation belongs to. */
  audience: DocAudience;
  /** True when the route is protected by an audience-determining guard. */
  requiresAuth: boolean;
  /** The ts-rest contract for the route, when defined via `@Api()/@TsRest()`. */
  appRoute?: AppRoute;
}

/** Resolve a guard entry (class or instance) to its class name. */
function guardName(guard: unknown): string | undefined {
  if (typeof guard === 'function') return guard.name;
  if (guard && typeof guard === 'object') return guard.constructor?.name;
  return undefined;
}

/**
 * Collect the audience-determining guards applied at the class and method level.
 * Returns the matching audiences (may be empty for unguarded / neutral routes).
 */
function collectAudiences(controllerClass: any, handler: any): DocAudience[] {
  const classGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controllerClass) ?? [];
  const methodGuards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
  const audiences: DocAudience[] = [];

  for (const guard of [...classGuards, ...methodGuards]) {
    const name = guardName(guard);
    const audience = name ? GUARD_AUDIENCE[name] : undefined;
    if (audience) audiences.push(audience);
  }
  return audiences;
}

/** Pick the most restrictive audience from a list (INTERNAL > ADMIN > USER). */
function mostRestrictive(audiences: DocAudience[]): DocAudience | undefined {
  if (!audiences.length) return undefined;
  return audiences.reduce((winner, current) =>
    AUDIENCE_PRIORITY[current] > AUDIENCE_PRIORITY[winner] ? current : winner
  );
}

/**
 * Walks every controller registered in the application and builds a map keyed by
 * `operationId` (`${ControllerName}_${methodName}`) describing the audience, auth
 * requirement, and ts-rest contract for each route handler.
 *
 * The `operationId` key matches the `operationIdFactory` configured in
 * `swagger.setup.ts`, so the generated OpenAPI document can be post-processed by
 * looking up `operation.operationId` here.
 */
export function buildRouteMetaMap(app: INestApplication): Map<string, RouteMeta> {
  const modulesContainer = app.get(ModulesContainer);
  const metadataScanner = new MetadataScanner();
  const map = new Map<string, RouteMeta>();

  for (const moduleRef of modulesContainer.values()) {
    for (const wrapper of moduleRef.controllers.values()) {
      const { metatype, instance } = wrapper;
      if (!metatype || !instance) continue;

      const prototype = Object.getPrototypeOf(instance);
      const methodNames = metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') continue;

        const audiences = collectAudiences(metatype, handler);
        const resolved = mostRestrictive(audiences);
        const appRoute: AppRoute | undefined = Reflect.getMetadata(TsRestAppRouteMetadataKey, handler);

        map.set(`${metatype.name}_${methodName}`, {
          audience: resolved ?? DEFAULT_AUDIENCE,
          requiresAuth: resolved !== undefined,
          appRoute,
        });
      }
    }
  }

  return map;
}
