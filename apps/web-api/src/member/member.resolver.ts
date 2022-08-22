import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CreateMemberInput } from './dto/create-member.input';
import { FetchMembersArgs } from './dto/fetch.members.input';
import { Member } from './entities/member.entity';
import { MemberService } from './member.service';

@Resolver(() => Member)
export class MemberResolver {
  constructor(private readonly memberService: MemberService) {}

  @Mutation(() => Member)
  createMember(
    @Args('createMemberInput') createMemberInput: CreateMemberInput,
  ) {
    return this.memberService.create(createMemberInput);
  }

  @Query(() => [Member], { name: 'member' })
  findAll(@Args() args: FetchMembersArgs) {
    return this.memberService.findAll(args);
  }
}
