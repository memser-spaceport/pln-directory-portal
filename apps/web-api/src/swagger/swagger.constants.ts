/**
 * Configuration for the audience-scoped Swagger documents.
 *
 * The web-api serves three OpenAPI documents instead of one flat list:
 *  - USER     → public / member-facing endpoints              (/api/docs)
 *  - ADMIN    → back-office / directory-admin endpoints        (/api/admin/docs)
 *  - INTERNAL → service-to-service / internal endpoints        (/api/internal/docs)
 *
 * Every endpoint is classified into exactly one audience based on the guards it
 * is protected by (see `route-audience.util.ts`). This avoids hand-annotating
 * each of the ~90 controllers.
 */

export enum DocAudience {
  USER = 'user',
  ADMIN = 'admin',
  INTERNAL = 'internal',
}

/** Security scheme identifiers registered on each document. */
export const SECURITY_SCHEMES = {
  [DocAudience.USER]: 'user-token',
  [DocAudience.ADMIN]: 'admin-token',
  [DocAudience.INTERNAL]: 'service-token',
} as const;

export interface SwaggerDocConfig {
  audience: DocAudience;
  path: string;
  title: string;
  description: string;
}

export const SWAGGER_DOCS: SwaggerDocConfig[] = [
  {
    audience: DocAudience.USER,
    path: 'api/docs',
    title: 'Protocol Labs Directory API — User',
    description:
      'Public and member-facing endpoints of the Protocol Labs Directory API. ' +
      'Authenticate with a member access token (Bearer JWT).',
  },
  {
    audience: DocAudience.ADMIN,
    path: 'api/admin/docs',
    title: 'Protocol Labs Directory API — Admin (Back Office)',
    description:
      'Back-office / directory-admin endpoints. Requires a directory admin access token (Bearer JWT) ' +
      'with the appropriate admin permissions.',
  },
  {
    audience: DocAudience.INTERNAL,
    path: 'api/internal/docs',
    title: 'Protocol Labs Directory API — Internal (Service)',
    description:
      'Service-to-service and internal endpoints. Requires a shared service secret in the ' +
      '`Authorization` header (e.g. `Basic <INTERNAL_SERVICE_SECRET>`).',
  },
];

/**
 * Maps a guard class name to the audience it implies.
 *
 * When a route is protected by guards from more than one audience, the most
 * restrictive audience wins (INTERNAL > ADMIN > USER) — see AUDIENCE_PRIORITY.
 *
 * Guards not listed here (e.g. RbacGuard, GoogleRecaptchaGuard, CSRFGuard) are
 * "neutral": they do not, on their own, place an endpoint into an audience.
 */
export const GUARD_AUDIENCE: Record<string, DocAudience> = {
  // Admin / back-office
  AdminAuthGuard: DocAudience.ADMIN,
  DemoDayAdminAuthGuard: DocAudience.ADMIN,
  DemoDayReadAuthGuard: DocAudience.ADMIN,
  TeamPitchAdminAuthGuard: DocAudience.ADMIN,
  TeamMembershipSourceReadAuthGuard: DocAudience.ADMIN,

  // Internal / service-to-service
  ServiceAuthGuard: DocAudience.INTERNAL,
  InternalAuthGuard: DocAudience.INTERNAL,
  InternalServiceThrottlerGuard: DocAudience.INTERNAL,

  // User / member-facing
  UserTokenValidation: DocAudience.USER,
  UserTokenCheckGuard: DocAudience.USER,
  OptionalUserTokenCheckGuard: DocAudience.USER,
  UserAccessTokenValidateGuard: DocAudience.USER,
  UserAuthValidateGuard: DocAudience.USER,
  UserAuthTokenValidation: DocAudience.USER,
  AuthGuard: DocAudience.USER,
};

/** Higher number = more restrictive. Used to pick the audience when guards mix. */
export const AUDIENCE_PRIORITY: Record<DocAudience, number> = {
  [DocAudience.USER]: 0,
  [DocAudience.ADMIN]: 1,
  [DocAudience.INTERNAL]: 2,
};

/** Endpoints with no audience-determining guard fall back to the USER document. */
export const DEFAULT_AUDIENCE = DocAudience.USER;
