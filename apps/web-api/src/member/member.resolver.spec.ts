import { Test, TestingModule } from '@nestjs/testing';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';

describe('MemberResolver', () => {
  let resolver: MemberResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MemberResolver, MemberService],
    }).compile();

    resolver = module.get<MemberResolver>(MemberResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
