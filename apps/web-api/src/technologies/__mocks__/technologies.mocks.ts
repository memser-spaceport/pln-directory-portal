import { Technology } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createTechnology({ amount }: TestFactorySeederParams) {
  const technologyFactory = Factory.define<Technology>(({ sequence }) => {
    const technology = {
      id: sequence,
      uid: `uid-${sequence}`,
      title: `Technology ${sequence}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return technology;
  });

  const technologies = await technologyFactory.buildList(amount);
  await prisma.technology.createMany({
    data: technologies,
  });
}
