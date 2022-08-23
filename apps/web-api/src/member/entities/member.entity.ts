import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Member as MemberModel } from '@prisma/client';

@ObjectType()
export class Member implements MemberModel {
  @Field(() => ID, { name: 'id', description: 'Member ID' })
  id: number;

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

  @Field({ name: 'create_at', description: 'Member createdAt' })
  created_at: Date;

  @Field({ name: 'updated_at', description: 'Member updatedAt' })
  updated_at: Date;
}
