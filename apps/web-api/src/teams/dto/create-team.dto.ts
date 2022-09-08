import { Prisma } from '@prisma/client';

export class CreateTeamDto implements Prisma.TeamCreateInput {
  uid?: string;
  logo?: string;
  blog?: string;
  website?: string;
  twitterHandler?: string;
  shortDescripton?: string;
  longDescripton?: string;
  filecoinUser: boolean;
  ipfsUser: boolean;
  plnFriend: boolean;
  startDate?: string | Date;
  endDate?: string | Date;
  industryTags?: Prisma.IndustryTagCreateNestedManyWithoutTeamsInput;
  acceleratorPrograms?: Prisma.AcceleratorProgramCreateNestedManyWithoutTeamsInput;
  fundingStage?: Prisma.FundingStageCreateNestedOneWithoutTeamsInput;
  name: string;
  image?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  members?: Prisma.MemberCreateNestedManyWithoutTeamsInput;
  skills?: Prisma.SkillCreateNestedManyWithoutMembersInput;
  location: Prisma.LocationCreateNestedOneWithoutMembersInput;
  teamMemberRoles?: Prisma.TeamMemberRoleCreateNestedManyWithoutTeamInput;
}
