import { Skill } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createSkill({ amount }: TestFactorySeederParams) {
  const skillFactory = Factory.define<Skill>(({ sequence }) => {
    const skill = {
      id: sequence,
      uid: `uid-${sequence}`,
      title: `Industry Tag ${sequence}`,
      description: `Industry Tag ${sequence} description`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return skill;
  });

  const skills = await skillFactory.buildList(amount);
  await prisma.skill.createMany({
    data: skills,
  });
}
