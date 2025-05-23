import { Test, TestingModule } from '@nestjs/testing';
import { EventsToolingService } from './events-tooling.service';

describe('EventsToolingService', () => {
  let service: EventsToolingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsToolingService],
    }).compile();

    service = module.get<EventsToolingService>(EventsToolingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
