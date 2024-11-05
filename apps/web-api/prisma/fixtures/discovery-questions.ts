import { Factory } from 'fishery';
import { DiscoveryQuestion } from '@prisma/client';
import { faker } from '@faker-js/faker';
import sample from 'lodash/sample';
import { prisma } from './../index';

const getUidsFrom = async (model, where = {}) => {
  return await prisma[model].findMany({
    select: { uid: true },
    where,
  });
};

const discoveryQuestionFactory = Factory.define<Omit<DiscoveryQuestion, 'id'>>(
  ({ sequence, onCreate }) => {
    onCreate(async (discoveryQuestion) => {
      const memberUids = await getUidsFrom('member');
      discoveryQuestion.createdBy = sample(memberUids.map((u) => u.uid)) || '';
      discoveryQuestion.modifiedBy = sample(memberUids.map((u) => u.uid)) || '';
      return discoveryQuestion;
    });

    return {
      uid: faker.datatype.uuid(),
      title: faker.lorem.words(5),
      content: faker.lorem.words(10),
      viewCount: faker.datatype.number({ min: 0, max: 1000 }),
      shareCount: faker.datatype.number({ min: 0, max: 500 }),
      slug: `${faker.helpers.slugify(faker.lorem.words(5))}-${sequence}`,
      isActive: faker.datatype.boolean(),
      teamUid: null,
      teamName: null,
      projectUid: null,
      projectName: null,
      eventUid: null,
      eventName: null,
      createdBy: '',
      modifiedBy: '',
      answer: faker.lorem.sentence(),
      answerSources: [{ 
        title: faker.lorem.words(5), 
        link: faker.internet.url(), 
        description: faker.lorem.sentence() 
      }, { 
        title: faker.lorem.words(5), 
        link: faker.internet.url(), 
        description: faker.lorem.sentence() 
      }],
      answerSourceFrom: faker.internet.url(),
      relatedQuestions: [
        { content : faker.lorem.words(5)},
        { content : faker.lorem.words(4)},
      ],
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    };
  }
);

export const discoveryQuestions = async () => await discoveryQuestionFactory.createList(4);
discoveryQuestions