import { PartialType } from '@nestjs/mapped-types';
import { Prisma } from '@prisma/client';
import { CreateMemberDto } from './create-member.dto';

export class UpdateMemberDto extends PartialType(CreateMemberDto) {
  githubHandler?: string;
  discordHandler?: string;
  twitterHandler?: string;
  officeHours?: string;
  plnFriend?: boolean;
  name?: string;
  image?: string;
  teams?: Prisma.TeamCreateNestedManyWithoutMembersInput;
  skills?: Prisma.SkillCreateNestedManyWithoutMembersInput;
  location: Prisma.LocationCreateNestedOneWithoutMembersInput;
  teamMemberRoles?: Prisma.TeamMemberRoleCreateNestedManyWithoutMemberInput;
  email?: string;
  password?: string;
}
