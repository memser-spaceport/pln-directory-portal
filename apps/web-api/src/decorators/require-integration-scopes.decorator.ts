import { SetMetadata } from '@nestjs/common';
import type { IntegrationKeyScope } from 'libs/contracts/src/schema/integration-key';

export const INTEGRATION_SCOPES_KEY = 'integration-scopes';

/**
 * Declares the integration-key scopes a route needs. Read by `IntegrationKeyGuard`,
 * which rejects an authenticated key lacking any of them with 403. A route without
 * this decorator accepts any active key.
 */
export const RequireIntegrationScopes = (...scopes: IntegrationKeyScope[]) =>
  SetMetadata(INTEGRATION_SCOPES_KEY, scopes);
