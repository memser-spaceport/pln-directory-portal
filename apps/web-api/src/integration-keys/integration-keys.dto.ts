import { createZodDto } from '@abitia/zod-dto';
import {
  CreateIntegrationKeyRequestSchema,
  ListIntegrationKeysQuerySchema,
} from 'libs/contracts/src/schema/integration-key';

export class CreateIntegrationKeyRequestDto extends createZodDto(CreateIntegrationKeyRequestSchema) {}
export class ListIntegrationKeysQueryDto extends createZodDto(ListIntegrationKeysQuerySchema) {}
