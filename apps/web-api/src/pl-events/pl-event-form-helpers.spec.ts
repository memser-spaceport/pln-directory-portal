jest.mock('ai', () => ({ generateObject: jest.fn() }));
jest.mock('axios');
// The provider module loads SDKs jest cannot parse; the service only asks it for a model.
jest.mock('../shared/ai-provider.service', () => ({ AiProviderService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@protocol-labs-network/airtable', () => ({}), { virtual: true });

import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { generateObject } from 'ai';
import axios from 'axios';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { eventDay, toAgendaSessions } from './pl-event-agenda';
import { PLEventFormHelpersController } from './pl-event-form-helpers.controller';
import { PLEventFormHelpersService } from './pl-event-form-helpers.service';

/** LAB-3343: the submit form's lookups. */

const generateObjectMock = generateObject as jest.MockedFunction<typeof generateObject>;
const axiosGet = axios.get as jest.MockedFunction<typeof axios.get>;

function helpers() {
  const aiProvider = { getResponsesModel: jest.fn(() => 'model') };
  const logger = { info: jest.fn(), error: jest.fn() };
  return new PLEventFormHelpersService(aiProvider as any, logger as any);
}

afterEach(() => jest.resetAllMocks());

describe('venue search and place resolve (Google mocked)', () => {
  const service = new LocationTransferService({} as any);
  const GEOCODE = {
    data: {
      results: [
        {
          place_id: 'place-tokyo',
          formatted_address: '2 Chome-21-1 Shibuya, Tokyo 150-8510, Japan',
          geometry: { location: { lat: 35.659, lng: 139.7036 } },
          address_components: [
            { long_name: 'Shibuya', types: ['sublocality'] },
            { long_name: 'Tokyo', types: ['locality', 'political'] },
            { long_name: 'Tokyo', types: ['administrative_area_level_1'] },
            { long_name: 'Japan', types: ['country'] },
          ],
        },
      ],
    },
  };

  it('returns up to 5 suggestions of any kind, with no region limit', async () => {
    axiosGet.mockResolvedValue({
      data: {
        predictions: Array.from({ length: 7 }, (_, i) => ({
          description: `Avenida da Liberdade ${i}`,
          place_id: `p${i}`,
        })),
      },
    });
    const suggestions = await service.searchVenues(' Avenida da Liberdade ');

    expect(suggestions).toHaveLength(5);
    expect(suggestions[0]).toEqual({ text: 'Avenida da Liberdade 0', placeId: 'p0' });
    const [url, config] = axiosGet.mock.calls[0] as [string, { params: Record<string, unknown> }];
    expect(url).toContain('/place/autocomplete/json');
    expect(config.params.input).toBe('Avenida da Liberdade');
    expect(config.params).not.toHaveProperty('types');
  });

  it('returns no suggestions when Google has none, and refuses an empty query', async () => {
    axiosGet.mockResolvedValue({ data: { status: 'ZERO_RESULTS' } });
    await expect(service.searchVenues('zzzz')).resolves.toEqual([]);
    await expect(service.searchVenues('  ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves a place with its parts, position, map link and time zone', async () => {
    axiosGet.mockResolvedValueOnce(GEOCODE).mockResolvedValueOnce({ data: { status: 'OK', timeZoneId: 'Asia/Tokyo' } });
    const place = await service.resolvePlace({ placeId: 'place-tokyo' });

    expect(place).toEqual({
      placeId: 'place-tokyo',
      address: '2 Chome-21-1 Shibuya, Tokyo 150-8510, Japan',
      city: 'Tokyo',
      state: 'Tokyo',
      country: 'Japan',
      latitude: 35.659,
      longitude: 139.7036,
      locationUrl: 'https://www.google.com/maps/search/?api=1&query=35.659%2C139.7036&query_place_id=place-tokyo',
      timezone: 'Asia/Tokyo',
    });
    expect((axiosGet.mock.calls[0][1] as any).params.place_id).toBe('place-tokyo');
    expect(axiosGet.mock.calls[1][0] as string).toContain('/timezone/json');
  });

  it('resolves by address text, and answers 404 for a text that matches no place', async () => {
    axiosGet.mockResolvedValueOnce(GEOCODE).mockResolvedValueOnce({ data: { status: 'OK', timeZoneId: 'Asia/Tokyo' } });
    await service.resolvePlace({ address: 'Shibuya Crossing' });
    expect((axiosGet.mock.calls[0][1] as any).params).toMatchObject({ address: 'Shibuya Crossing' });

    axiosGet.mockResolvedValueOnce({ data: { status: 'ZERO_RESULTS', results: [] } });
    await expect(service.resolvePlace({ address: 'zzzz qqqq' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolvePlace({})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the place with a null time zone when the time zone lookup fails', async () => {
    axiosGet.mockResolvedValueOnce(GEOCODE).mockRejectedValueOnce(new Error('timeout'));
    expect((await service.resolvePlace({ placeId: 'place-tokyo' })).timezone).toBeNull();

    axiosGet.mockResolvedValueOnce(GEOCODE).mockResolvedValueOnce({ data: { status: 'REQUEST_DENIED' } });
    expect((await service.resolvePlace({ placeId: 'place-tokyo' })).timezone).toBeNull();
  });
});

describe('agenda parsing (model mocked)', () => {
  const INPUT = {
    text: '10:00 AM - 10:30 AM Opening Ceremony',
    startDate: '2026-01-28',
    endDate: '2026-01-28',
    timezone: 'Europe/Lisbon',
  };
  const modelSays = (object: unknown) => generateObjectMock.mockResolvedValue({ object } as any);

  it('returns sessions as instants in the event time zone', async () => {
    modelSays({
      isValid: true,
      message: '',
      sessions: [
        { name: 'Opening Ceremony', description: '', date: '', startTime: '10:00', endTime: '10:30' },
        { name: 'Keynote', description: 'The year ahead', date: '2026-01-28', startTime: '11:00', endTime: '' },
      ],
    });
    const result = await helpers().parseAgenda(INPUT);

    // Lisbon is UTC+0 in January.
    expect(result).toEqual({
      message: null,
      sessions: [
        {
          name: 'Opening Ceremony',
          description: '',
          start_date: '2026-01-28T10:00:00.000Z',
          end_date: '2026-01-28T10:30:00.000Z',
          timezone: 'Europe/Lisbon',
        },
        // No end time: one hour.
        {
          name: 'Keynote',
          description: 'The year ahead',
          start_date: '2026-01-28T11:00:00.000Z',
          end_date: '2026-01-28T12:00:00.000Z',
          timezone: 'Europe/Lisbon',
        },
      ],
    });
    const call = generateObjectMock.mock.calls[0][0] as any;
    expect(call.prompt).toContain('The event is on 2026-01-28 (one day)');
    expect(call.prompt).toContain(INPUT.text);
    expect(call.temperature).toBe(0);
  });

  it('computes the offset of the session day, not of today (daylight saving)', () => {
    const session = { name: 'Talk', description: '', date: '', startTime: '09:00', endTime: '' };
    const summer = toAgendaSessions(
      { isValid: true, message: '', sessions: [session] },
      { startDay: '2026-07-24', endDay: '2026-07-24', timezone: 'Europe/Lisbon' }
    );
    expect(summer.sessions[0].start_date).toBe('2026-07-24T08:00:00.000Z');
    const short = toAgendaSessions(
      {
        isValid: true,
        message: '',
        sessions: [
          { ...session, startTime: '9:05', endTime: '23:30' },
          { ...session, startTime: '23:00', endTime: '01:00' },
        ],
      },
      { startDay: '2026-07-24', endDay: '2026-07-24', timezone: 'UTC' }
    );
    expect(short.sessions.map((item) => [item.start_date, item.end_date])).toEqual([
      ['2026-07-24T09:05:00.000Z', '2026-07-24T23:30:00.000Z'],
      // An end before the start is on the next day.
      ['2026-07-24T23:00:00.000Z', '2026-07-25T01:00:00.000Z'],
    ]);
    expect(eventDay('2026-07-24T23:30:00Z', 'Asia/Tokyo')).toBe('2026-07-25');
  });

  it('returns a message that times are missing, and no sessions', async () => {
    modelSays({ isValid: false, message: 'The times are missing', sessions: [] });
    const result = await helpers().parseAgenda({ ...INPUT, text: 'Opening ceremony, then lunch' });
    expect(result).toEqual({ sessions: [], message: 'The times are missing' });

    modelSays({
      isValid: true,
      message: '',
      sessions: [{ name: 'Lunch', description: '', date: '', startTime: 'noon-ish', endTime: '' }],
    });
    expect((await helpers().parseAgenda(INPUT)).message).toMatch(/times are missing/i);
  });

  it('asks for dates when a multi-day event names none', async () => {
    modelSays({
      isValid: true,
      message: '',
      sessions: [{ name: 'Talk', description: '', date: '', startTime: '09:00', endTime: '10:00' }],
    });
    const result = await helpers().parseAgenda({ ...INPUT, endDate: '2026-01-30' });
    expect(result.sessions).toEqual([]);
    expect(result.message).toBe(
      "This is a multi-day event (2026-01-28 to 2026-01-30). Please provide specific dates for each day's activities."
    );
  });

  it('answers 503 when the model cannot be reached', async () => {
    generateObjectMock.mockRejectedValue(new Error('provider down'));
    await expect(helpers().parseAgenda(INPUT)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('lookup routes: sign-in required', () => {
  const routes = PLEventFormHelpersController.prototype;

  it('every route needs a user token, and there are three of them', () => {
    expect(Reflect.getMetadata('__guards__', PLEventFormHelpersController)).toEqual([UserTokenValidation]);
    const handlers = Object.getOwnPropertyNames(routes).filter(
      (name) => !['constructor', 'assertEnabled'].includes(name)
    );
    expect(handlers.sort()).toEqual(['parseAgenda', 'resolvePlace', 'searchPlaces']);
  });

  it('the controller refuses an empty query, a body with no text, and everything while the flag is off', async () => {
    const flag = process.env.EVENTS_LOCAL_SUBMIT_ENABLED;
    const locations = { searchVenues: jest.fn(async () => []), resolvePlace: jest.fn() };
    const controller = new PLEventFormHelpersController(locations as any, helpers());
    try {
      process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
      await expect(controller.searchPlaces({ query: ' ' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.searchPlaces({ query: 'Lisbon' })).resolves.toEqual([]);
      await expect(controller.resolvePlace({})).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        controller.parseAgenda({ text: '', startDate: '2026-01-28', endDate: '2026-01-28', timezone: 'UTC' })
      ).rejects.toBeInstanceOf(BadRequestException);

      process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'false';
      await expect(controller.searchPlaces({ query: 'Lisbon' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(controller.resolvePlace({ placeId: 'p' })).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      process.env.EVENTS_LOCAL_SUBMIT_ENABLED = flag;
    }
  });
});
