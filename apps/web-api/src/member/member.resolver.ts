import {
  Resolver,
  Query,
  Mutation,
  Args,
  Int,
  ResolveField,
} from '@nestjs/graphql';
import { MemberService } from './member.service';
import { Member } from './entities/member.entity';
import { CreateMemberInput } from './dto/create-member.input';
import { FetchMembersArgs } from './dto/fetch.members.input';

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

  // @Query(() => Member, { name: 'member' })
  // findOne(@Args('id', { type: () => Int }) id: number) {
  //   return this.memberService.findOne(id);
  // }

  // @Mutation(() => Member)
  // updateMember(@Args('updateMemberInput') updateMemberInput: UpdateMemberInput) {
  //   return this.memberService.update(updateMemberInput.id, updateMemberInput);
  // }

  // @Mutation(() => Member)
  // removeMember(@Args('id', { type: () => Int }) id: number) {
  //   return this.memberService.remove(id);
  // }
}
