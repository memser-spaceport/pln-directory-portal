import { AcceleratorProgram } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createAcceleratorProgram({
  amount,
}: TestFactorySeederParams) {
  const acceleratorProgramFactory = Factory.define<
    Omit<AcceleratorProgram, 'id'>
  >(({ sequence }) => {
    const acceleratorProgram = {
      uid: `uid-${sequence}`,
      title: `Accelerator Program ${sequence}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return acceleratorProgram;
  });

  const acceleratorPrograms = await acceleratorProgramFactory.buildList(amount);
  await prisma.acceleratorProgram.createMany({
    data: acceleratorPrograms,
  });
}
