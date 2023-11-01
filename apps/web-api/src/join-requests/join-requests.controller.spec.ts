import { Test, TestingModule } from '@nestjs/testing';
import { JoinRequestsController } from './join-requests.controller';
import { JoinRequestsService } from './join-request.service';

describe('JoinRequestsController', () => {
  let controller: JoinRequestsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JoinRequestsController],
      providers: [JoinRequestsService],
    }).compile();

    controller = module.get<JoinRequestsController>(JoinRequestsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
