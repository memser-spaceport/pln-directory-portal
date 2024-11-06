import { Factory } from 'fishery';
import { TeamFocusArea } from '@prisma/client';
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

const teamFocusAreaFactory = Factory.define<Omit<TeamFocusArea, 'id'>>(
  ({ onCreate }) => {
    onCreate(async (teamFocusArea) => {
      // Fetch UIDs for relational fields
      const teamUids = await (
        await getUidsFrom('team')
      ).map((result) => result.uid);
      teamFocusArea.teamUid = sample(teamUids);

      const focusAreaUids = await (
        await getUidsFrom('focusArea')
      ).map((result) => result.uid);
      const focusAreaUid = sample(focusAreaUids);
      teamFocusArea.focusAreaUid = focusAreaUid;
      teamFocusArea.ancestorAreaUid = focusAreaUid;
      return teamFocusArea;
    });
    return {
      teamUid: '',
      focusAreaUid: '',
      ancestorAreaUid: '',
    };
  }
);

export const teamFocusAreas = async () => await teamFocusAreaFactory.createList(8);
