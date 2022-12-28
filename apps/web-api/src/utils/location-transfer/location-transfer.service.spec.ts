import { Test, TestingModule } from '@nestjs/testing';
import { prisma } from 'apps/web-api/prisma/__mocks__';
import { PrismaService } from '../../prisma.service';
import './__mocks__/location-transfer.mocks';
import { LocationTransferService } from './location-transfer.service';

describe('LocationTransferService', () => {
  let locationTransferService: LocationTransferService;
  let prismaService: PrismaService;
  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      providers: [LocationTransferService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    locationTransferService = app.get<LocationTransferService>(
      LocationTransferService
    );
  });

  describe('When transferring location', () => {
    it('should return a location object', async () => {
      const member = {
        id: 'rec146jfslU8o5jOz',
        fields: {
          Name: 'XXXXXXXX',
          Skills: ['Finance', 'Management'],
          'Team lead': true,
          Role: 'Co-Founder & CEO',
          'State / Province': 'Texas',
          Country: 'United States',
          City: 'Austin',
          'Metro Area': 'Austin',
          'Friend of PLN': true,
          Region: 'North America',
          Created: '2022-10-04',
        },
      };
      const { location } = await locationTransferService.transferLocation(
        member
      );

      expect(location).toBeDefined();
      expect(location?.city).toEqual('Austin');
      expect(location?.country).toEqual('United States');
      expect(location?.continent).toEqual('North America');
      expect(location?.region).toEqual('Texas');
      expect(location?.regionAbbreviation).toEqual('TX');
      expect(location?.metroArea).toEqual('Texas');
      expect(location?.latitude).toEqual(30.267153);
      expect(location?.longitude).toEqual(-97.7430608);
    });
    it('Should return the same location if the information is the same', async () => {
      const member = {
        id: 'rec146jfslU8o5jOz',
        fields: {
          Name: 'XXXXXXXX',
          Skills: ['Finance', 'Management'],
          'Team lead': true,
          Role: 'Co-Founder & CEO',
          'State / Province': 'Texas',
          Country: 'United States',
          City: 'Austin',
          'Metro Area': 'Austin',
          'Friend of PLN': true,
          Region: 'North America',
          Created: '2022-10-04',
        },
      };
      const { location: location1 } =
        await locationTransferService.transferLocation(member);
      const { location: location2 } =
        await locationTransferService.transferLocation(member);

      expect(location1?.id).toEqual(location2?.id);
    });
    it('Should return no results status', async () => {
      const member = {
        id: 'rec146jfslU8o5jOz',
        fields: {
          Name: 'XXXXXXXX',
          Skills: ['Finance', 'Management'],
          'Team lead': true,
          Role: 'Co-Founder & CEO',
          'State / Province': 'Texas',
          Country: 'United States',
          City: 'not a real city',
          'Metro Area': 'Austin',
          'Friend of PLN': true,
          Region: 'North America',
          Created: '2022-10-04',
        },
      };
      const data = await locationTransferService.transferLocation(member);
      expect(data.status).toEqual('ZERO_RESULTS');
    });
    describe('Should return not provided status', () => {
      it('When required fields have the not provided value', async () => {
        const member = {
          id: 'rec146jfslU8o5jOz',
          fields: {
            Name: 'XXXXXXXX',
            Skills: ['Finance', 'Management'],
            'Team lead': true,
            Role: 'Co-Founder & CEO',
            'State / Province': 'Not Provided',
            Country: 'Not Provided',
            City: 'Not Provided',
            'Metro Area': 'Not Provided',
            'Friend of PLN': true,
            Region: 'Not Provided',
            Created: '2022-10-04',
          },
        };
        const data = await locationTransferService.transferLocation(member);
        expect(data.status).toEqual('NOT_PROVIDED');
      });
      it('When required fields are not provided', async () => {
        const member = {
          id: 'rec146jfslU8o5jOz',
          fields: {
            Name: 'XXXXXXXX',
            Skills: ['Finance', 'Management'],
            'Team lead': true,
            Role: 'Co-Founder & CEO',
            'Metro Area': 'Not Provided',
            'Friend of PLN': true,
            Created: '2022-10-04',
          },
        };
        const data = await locationTransferService.transferLocation(member);
        expect(data.status).toEqual('NOT_PROVIDED');
      });
    });
    it('Should return a no predictions status', async () => {
      const member = {
        id: 'rec146jfslU8o5jOz',
        fields: {
          Name: 'XXXXXXXX',
          Skills: ['Finance', 'Management'],
          'Team lead': true,
          Role: 'Co-Founder & CEO',
          'State / Province': 'noPrediction',
          Country: 'noPrediction',
          City: 'noPrediction',
          'Metro Area': 'noPrediction',
          'Friend of PLN': true,
          Region: 'noPrediction',
          Created: '2022-10-04',
        },
      };
      const data = await locationTransferService.transferLocation(member);
      expect(data.status).toEqual('NO_PREDICTIONS');
    });

    it('Should return a no required place status', async () => {
      const member = {
        id: 'rec146jfslU8o5jOz',
        fields: {
          Name: 'XXXXXXXX',
          Skills: ['Finance', 'Management'],
          'Team lead': true,
          Role: 'Co-Founder & CEO',
          'State / Province': 'noRequiredPlace',
          Country: 'noRequiredPlace',
          City: 'noRequiredPlace',
          'Metro Area': 'noRequiredPlace',
          'Friend of PLN': true,
          Region: 'noRequiredPlace',
          Created: '2022-10-04',
        },
      };
      const data = await locationTransferService.transferLocation(member);
      expect(data.status).toEqual('NO_REQUIRED_PLACE');
    });
  });
});
