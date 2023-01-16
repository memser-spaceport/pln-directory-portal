import { MembershipSourcesService } from '../../membership-sources/membership-sources.service';
import { FundingStagesService } from '../../funding-stages/funding-stages.service';
import { IndustryCategoriesService } from '../../industry-categories/industry-categories.service';
import { IndustryTagsService } from '../../industry-tags/industry-tags.service';
import { MembersService } from '../../members/members.service';
import { SkillsService } from '../../skills/skills.service';
import { TeamMemberRolesService } from '../../team-member-roles/team-member-roles.service';
import { TeamsService } from '../../teams/teams.service';
import { TechnologiesService } from '../../technologies/technologies.service';
import { AirtableService } from '../../utils/airtable/airtable.service';

export const TEST_SERVICES_MOCK = (customMethods = {}) =>
  [
    // Build for all services injected the needed mocked methods:
    ...Array(10)
      .fill('')
      .map(
        () =>
          ({
            getAllTeams: jest.fn(() => Promise.resolve([])),
            getAllMembers: jest.fn(() => Promise.resolve([])),
            getAllIndustryTags: jest.fn(() => Promise.resolve([])),
            insertManyFromList: jest.fn(() => Promise.resolve()),
            insertManyFromAirtable: jest.fn(() => Promise.resolve()),
            insertManyWithLocationsFromAirtable: jest.fn(() =>
              Promise.resolve()
            ),
            ...customMethods,
          } as unknown)
      ),
  ] as [
    TeamsService,
    SkillsService,
    MembersService,
    AirtableService,
    TechnologiesService,
    IndustryTagsService,
    FundingStagesService,
    TeamMemberRolesService,
    IndustryCategoriesService,
    MembershipSourcesService
  ];
