import { FundingStage } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createFundingStage({ amount }: TestFactorySeederParams) {
  const industryTagFactory = Factory.define<FundingStage>(({ sequence }) => {
    const industryTag = {
      id: sequence,
      uid: `uid-${sequence}`,
      title: `Industry Tag ${sequence}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return industryTag;
  });

  const industryTags = await industryTagFactory.buildList(amount);
  await prisma.fundingStage.createMany({
    data: industryTags,
  });
}
