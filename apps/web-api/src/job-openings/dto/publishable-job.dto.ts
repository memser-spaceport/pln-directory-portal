import { createZodDto } from '@abitia/zod-dto';
import { ClaimJobSchema, JobStatePatchSchema, PublishableJobSchema } from 'libs/contracts/src/schema/publishable-job';

export class PublishableJobDto extends createZodDto(PublishableJobSchema) {}
export class JobStatePatchDto extends createZodDto(JobStatePatchSchema) {}
export class ClaimJobDto extends createZodDto(ClaimJobSchema) {}
