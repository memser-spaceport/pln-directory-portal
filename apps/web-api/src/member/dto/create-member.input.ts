import { Field, InputType } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';

@InputType()
export class CreateMemberInput implements Prisma.MemberCreateInput {
  @Field({ name: 'name', description: 'Member name' })
  name: string;

  @Field({ name: 'email', description: 'Member Email' })
  email: string;

  @Field({ name: 'image', description: 'Member image' })
  image: string;

  @Field({ name: 'github_handler', description: 'Member github_handler' })
  github_handler: string;

  @Field({ name: 'discord_handler', description: 'Member discord_handler' })
  discord_handler: string;

  @Field({ name: 'twitter', description: 'Member twitter' })
  twitter: string;

  @Field({ name: 'office_hours', description: 'Member office_hours' })
  office_hours: string;

  @Field(() => Boolean, {
    name: 'pln_friend',
    description: 'Is Member pln_friend',
  })
  pln_friend: boolean;
}
