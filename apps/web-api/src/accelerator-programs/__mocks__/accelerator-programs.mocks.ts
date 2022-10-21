import { AcceleratorProgram } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createAcceleratorProgram({
  amount,
}: TestFactorySeederParams) {
  const acceleratorProgramFactory = Factory.define<AcceleratorProgram>(
    ({ sequence }) => {
      const acceleratorProgram = {
        id: sequence,
        uid: `uid-${sequence}`,
        title: `Accelerator Program ${sequence}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      return acceleratorProgram;
    }
  );

  const acceleratorPrograms = await acceleratorProgramFactory.buildList(amount);
  await prisma.acceleratorProgram.createMany({
    data: acceleratorPrograms,
  });
}
