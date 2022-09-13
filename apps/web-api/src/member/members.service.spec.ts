import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';

describe('MembersService', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MembersService, MemberController, PrismaService],
    }).compile();

    service = module.get<MembersService>(MembersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
