import { Factory } from 'fishery';
import { ProjectFocusArea } from '@prisma/client';
import sample from 'lodash/sample';
import { prisma } from './../index';

const getUidsFrom = async (model, where = {}) => {
  return await prisma[model].findMany({
    select: {
      uid: true,
    },
    where,
  });
};

const projectFocusAreaFactory = Factory.define<Omit<ProjectFocusArea, 'id'>>(
  ({ onCreate }) => {
    onCreate(async (projectFocusArea) => {
      // Fetch UIDs for relational fields
      const projectUids = await (
        await getUidsFrom('project')
      ).map((result) => result.uid);
      projectFocusArea.projectUid = sample(projectUids);

      const focusAreaUids = await (
        await getUidsFrom('focusArea')
      ).map((result) => result.uid);
      const focusAreaUid = sample(focusAreaUids);
      projectFocusArea.focusAreaUid = focusAreaUid;
      projectFocusArea.ancestorAreaUid = focusAreaUid;

      return projectFocusArea;
    });
    return {
      projectUid: '',
      focusAreaUid: '',
      ancestorAreaUid: '',
    };
  }
);

export const projectFocusAreas = async () => await projectFocusAreaFactory.createList(15);
