import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const AcceleratorProgramSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ResponseAcceleratorProgramSchema = AcceleratorProgramSchema.omit({
  id: true,
});

export const CreateAcceleratorProgramSchema = AcceleratorProgramSchema.pick({
  title: true,
});

export const UpdateAcceleratorProgramSchema = AcceleratorProgramSchema.pick({
  title: true,
});

export class CreateAcceleratorProgramDto extends createZodDto(
  CreateAcceleratorProgramSchema
) {}

export class UpdateAcceleratorProgramDto extends createZodDto(
  UpdateAcceleratorProgramSchema
) {}
