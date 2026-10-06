import { z } from 'zod';
import { createZodDto } from '@abitia/zod-dto';

const cpuSchema = z
  .string()
  .trim()
  .regex(/^(?:\d+(?:\.\d+)?|\d+m)$/, 'CPU must be a Kubernetes CPU value, e.g. "250m", "2", "4"');

const memorySchema = z
  .string()
  .trim()
  .regex(
    /^\d+(?:\.\d+)?(?:Ki|Mi|Gi|Ti)$/,
    'Memory must be a Kubernetes memory value, e.g. "512Mi", "4Gi", "6Gi"',
  );

const cpuToMillicores = (value: string): number =>
  value.endsWith('m') ? Number(value.slice(0, -1)) : Number(value) * 1000;

const memoryToMi = (value: string): number => {
  const match = value.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti)$/);
  if (!match) return Number.NaN;

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'Ki':
      return amount / 1024;
    case 'Mi':
      return amount;
    case 'Gi':
      return amount * 1024;
    case 'Ti':
      return amount * 1024 * 1024;
    default:
      return Number.NaN;
  }
};

export const AiAppEnvironmentSchema = z
  .string()
  .trim()
  .min(1, 'environment is required')
  .regex(/^[a-zA-Z0-9_-]+$/, 'environment contains invalid characters');

export const AiAppResourcesSchema = z
  .object({
    cpuRequest: cpuSchema,
    cpuLimit: cpuSchema,
    memoryRequest: memorySchema,
    memoryLimit: memorySchema,
  })
  .superRefine((value, ctx) => {
    if (cpuToMillicores(value.cpuRequest) > cpuToMillicores(value.cpuLimit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cpuRequest'],
        message: 'cpuRequest must be <= cpuLimit',
      });
    }

    if (memoryToMi(value.memoryRequest) > memoryToMi(value.memoryLimit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['memoryRequest'],
        message: 'memoryRequest must be <= memoryLimit',
      });
    }
  });

export class UpdateAiAppResourcesDto extends createZodDto(AiAppResourcesSchema) {}
