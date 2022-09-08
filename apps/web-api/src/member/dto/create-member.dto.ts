import { Prisma } from '@prisma/client';

export class CreateMemberDto implements Prisma.MemberCreateInput {
  githubHandler?: string;
  discordHandler?: string;
  twitterHandler?: string;
  officeHours?: string;
  plnFriend: boolean;
  uid?: string;
  name: string;
  image?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  teams?: Prisma.TeamCreateNestedManyWithoutMembersInput;
  skills?: Prisma.SkillCreateNestedManyWithoutMembersInput;
  location: Prisma.LocationCreateNestedOneWithoutMembersInput;
  teamMemberRoles?: Prisma.TeamMemberRoleCreateNestedManyWithoutMemberInput;
  email: string;
  password: string;
}
