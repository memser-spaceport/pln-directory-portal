import { IndustryCategory, IndustryTag } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

async function createIndustryCategory() {
  const industryCategoryFactory = Factory.define<IndustryCategory>(
    ({ sequence }) => ({
      id: sequence,
      uid: `industry-category-${sequence}`,
      title: `Industry Category Title ${sequence}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  const industryCategory = await industryCategoryFactory.build();
  return await prisma.industryCategory.create({ data: industryCategory });
}

export async function createIndustryTags({ amount }: TestFactorySeederParams) {
  const industryCategory = await createIndustryCategory();

  const industryTagFactory = Factory.define<IndustryTag>(({ sequence }) => {
    const industryTag = {
      id: sequence,
      uid: `uid-${sequence}`,
      title: `Industry Tag ${sequence}`,
      definition: 'Industry Tag Definition',
      createdAt: new Date(),
      updatedAt: new Date(),
      industryCategoryUid: industryCategory.uid,
    };

    return industryTag;
  });

  const industryTags = await industryTagFactory.buildList(amount);
  await prisma.industryTag.createMany({
    data: industryTags,
  });
}
