import { PartialType } from '@nestjs/mapped-types';
import { Prisma } from '@prisma/client';
import { CreateTeamDto } from './create-team.dto';

export class UpdateTeamDto extends PartialType(CreateTeamDto) {
  logo?: string;
  blog?: string;
  website?: string;
  twitterHandler?: string;
  shortDescripton?: string;
  longDescripton?: string;
  filecoinUser?: boolean;
  ipfsUser?: boolean;
  plnFriend?: boolean;
  startDate?: string | Date;
  endDate?: string | Date;
  industryTags?: Prisma.IndustryTagCreateNestedManyWithoutTeamsInput;
  acceleratorPrograms?: Prisma.AcceleratorProgramCreateNestedManyWithoutTeamsInput;
  fundingStage?: Prisma.FundingStageCreateNestedOneWithoutTeamsInput;
  name?: string;
  image?: string;
  members?: Prisma.MemberCreateNestedManyWithoutTeamsInput;
  skills?: Prisma.SkillCreateNestedManyWithoutMembersInput;
  location: Prisma.LocationCreateNestedOneWithoutMembersInput;
  teamMemberRoles?: Prisma.TeamMemberRoleCreateNestedManyWithoutTeamInput;
}
