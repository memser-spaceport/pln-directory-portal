import { Test, TestingModule } from '@nestjs/testing';
import { FocusAreasService } from './focus-areas.service';
import { Request } from 'express';
import { of } from 'rxjs';
import { apiFocusAreas } from 'libs/contracts/src/lib/contract-focus-areas';
import { initNestServer } from '@ts-rest/nest';
import { FocusAreaController } from './focus-areas.controller';

const server = initNestServer(apiFocusAreas);

describe('FocusAreaController', () => {
  let controller: FocusAreaController;
  let service: FocusAreasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FocusAreaController],
      providers: [
        {
          provide: FocusAreasService,
          useValue: {
            findAll: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FocusAreaController>(FocusAreaController);
    service = module.get<FocusAreasService>(FocusAreasService);
  });

  describe('findAll', () => {
    it('should return the expected focus areas', async () => {
      const mockQuery = { type: 'PROJECT' };
      const mockResponse: any = [{ id: 1, name: 'Focus Area 1' }];

      // Mocking the service call
      jest.spyOn(service, 'findAll').mockResolvedValue(mockResponse);

      // Simulating the request object
      const req = { query: mockQuery } as unknown as Request;

      const result = await controller.findAll(req);

      expect(service.findAll).toHaveBeenCalledWith(mockQuery);
      expect(result).toEqual(mockResponse);
    });
  });
});
