const teamMock = { id: 'team_01' } as IAirtableTeam;
const teamsMock = [teamMock];
const teamsTableMock: Airtable.Table<object> = {
  select: jest.fn().mockReturnValue({
    all: jest.fn().mockReturnValue(teamsMock),
  }),
  find: jest.fn().mockReturnValue(teamMock),
};

const labberMock = { id: 'labber_01' } as IAirtableLabber;
const labbersMock = [labberMock];
const labbersTableMock: Airtable.Table<object> = {
  select: jest.fn().mockReturnValue({
    all: jest.fn().mockReturnValue(labbersMock),
  }),
  find: jest.fn().mockReturnValue(labberMock),
};

const baseFunctionMock = jest.fn().mockImplementation((tableId: string) => {
  return tableId === process.env.AIRTABLE_TEAMS_TABLE_ID
    ? teamsTableMock
    : labbersTableMock;
});
const baseMock = jest.fn().mockImplementation(() => baseFunctionMock);
const airtableMock = jest.fn().mockImplementation(() => {
  return {
    base: baseMock,
  };
});

jest.mock('airtable', () => {
  return airtableMock;
});

import Airtable = require('airtable');
import { IAirtableLabber, IAirtableTeam } from '../models';
import airtableService from './airtable';

describe('AirtableService', () => {
  describe('when initialized', () => {
    it('should create a new Airtable instance', () => {
      expect(airtableMock).toHaveBeenCalledTimes(1);
      expect(airtableMock).toHaveBeenCalledWith({
        apiKey: process.env.AIRTABLE_API_KEY,
      });
    });

    it('should get the Airtable base', () => {
      expect(baseMock).toHaveBeenCalledTimes(1);
      expect(baseMock).toHaveBeenCalledWith(process.env.AIRTABLE_BASE_ID);
    });

    it('should get the Airtable tables', () => {
      expect(baseFunctionMock).toHaveBeenCalledTimes(2);
      expect(baseFunctionMock).toHaveBeenCalledWith(
        process.env.AIRTABLE_TEAMS_TABLE_ID
      );
      expect(baseFunctionMock).toHaveBeenCalledWith(
        process.env.AIRTABLE_LABBERS_TABLE_ID
      );
    });
  });

  describe('#getAllTeams', () => {
    let teams: IAirtableTeam[];

    beforeEach(async () => {
      teams = await airtableService.getAllTeams();
    });

    it('should select all teams from teams table', () => {
      expect(teamsTableMock.select).toHaveBeenCalledTimes(1);
      expect(teamsTableMock.select().all).toHaveBeenCalledTimes(1);
    });

    it('should retrieve all teams', () => {
      expect(teams).toEqual(teamsMock);
    });
  });

  describe('#getTeam', () => {
    let team: IAirtableTeam;

    beforeEach(async () => {
      team = await airtableService.getTeam(teamMock.id);
    });

    it('should find the team with the provided id on teams table', () => {
      expect(teamsTableMock.find).toHaveBeenCalledTimes(1);
      expect(teamsTableMock.find).toHaveBeenCalledWith(teamMock.id);
    });

    it('should retrieve the team with the provided id', () => {
      expect(team).toEqual(teamMock);
    });
  });

  describe('#getAllLabbers', () => {
    let labbers: IAirtableLabber[];

    beforeEach(async () => {
      labbers = await airtableService.getAllLabbers();
    });

    it('should select all labbers from labbers table', () => {
      expect(labbersTableMock.select).toHaveBeenCalledTimes(1);
      expect(labbersTableMock.select().all).toHaveBeenCalledTimes(1);
    });

    it('should retrieve all labbers', () => {
      expect(labbers).toEqual(labbersMock);
    });
  });

  describe('#getLabber', () => {
    let labber: IAirtableLabber;

    beforeEach(async () => {
      labber = await airtableService.getLabber(labberMock.id);
    });

    it('should find the labber with the provided id on labbers table', () => {
      expect(labbersTableMock.find).toHaveBeenCalledTimes(1);
      expect(labbersTableMock.find).toHaveBeenCalledWith(labberMock.id);
    });

    it('should retrieve the labber with the provided id', () => {
      expect(labber).toEqual(labberMock);
    });
  });
});
