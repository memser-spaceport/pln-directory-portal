import { Factory } from 'fishery';
import { DiscoveryQuestion } from '@prisma/client';
import { faker } from '@faker-js/faker';
import sample from 'lodash/sample';
import { prisma } from './../index';

const getUidsAndNamesFrom = async (model, nameField = 'name', where = {}) => {
  return await prisma[model].findMany({
    select: { uid: true, [nameField]: true },
    where,
  });
};

const discoveryQuestionFactory = Factory.define<Omit<DiscoveryQuestion, 'id'>>(
  ({ sequence, onCreate }) => {
    onCreate(async (discoveryQuestion) => {
      const memberUids = await getUidsAndNamesFrom('member');
      discoveryQuestion.createdBy = sample(memberUids.map((u) => u.uid)) || '';
      discoveryQuestion.modifiedBy = sample(memberUids.map((u) => u.uid)) || '';

      if (sequence >= 4) {
        // Fetch UIDs and names for event, project, and team only if sequence >= 4
        const [eventData, projectData, teamData] = await Promise.all([
          getUidsAndNamesFrom('pLEvent'),
          getUidsAndNamesFrom('project'),
          getUidsAndNamesFrom('team'),
        ]);
        
        // Randomly assign one of the UIDs and its corresponding name
        const assignment = sample([
          { uidKey: 'eventUid', nameKey: 'eventName', data: eventData },
          { uidKey: 'projectUid', nameKey: 'projectName', data: projectData },
          { uidKey: 'teamUid', nameKey: 'teamName', data: teamData }
        ]);

        if (assignment && assignment.data.length > 0) {
          const selected = sample(assignment.data);
          discoveryQuestion[assignment.uidKey] = selected?.uid || null;
          discoveryQuestion[assignment.nameKey] = selected?.name || null;
        }
      }

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

export const discoveryQuestions = async () => await discoveryQuestionFactory.createList(15);
