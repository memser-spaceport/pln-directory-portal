import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';

describe('MemberController', () => {
  let controller: MemberController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MembersService, PrismaService],
      controllers: [MemberController],
    }).compile();

    controller = module.get<MemberController>(MemberController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
