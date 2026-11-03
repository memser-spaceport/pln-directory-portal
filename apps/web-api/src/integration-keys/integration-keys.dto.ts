import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';
import {
  CreateIntegrationKeyRequestSchema,
  ListIntegrationKeysQuerySchema,
} from 'libs/contracts/src/schema/integration-key';
import { PLAA_MANAGEABLE_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

export class CreateIntegrationKeyRequestDto extends createZodDto(CreateIntegrationKeyRequestSchema) {}
export class ListIntegrationKeysQueryDto extends createZodDto(ListIntegrationKeysQuerySchema) {}

/** Body of the PLAA grant/revoke routes. Only PLAA permissions from the allowlist pass. */
export const PlaaPermissionRequestSchema = z.object({
  permission: z.enum(PLAA_MANAGEABLE_PERMISSIONS),
});
export class PlaaPermissionRequestDto extends createZodDto(PlaaPermissionRequestSchema) {}
