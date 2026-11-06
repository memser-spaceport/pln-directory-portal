import { BadRequestException } from '@nestjs/common';
import { parseUpcomingEventsQuery, toUpcomingEvent, upcomingEventsFindArgs } from './upcoming-events-query';

describe('parseUpcomingEventsQuery (LAB-3071)', () => {
  it('reads nothing from an empty query', () => {
    expect(parseUpcomingEventsQuery({})).toEqual({});
    expect(parseUpcomingEventsQuery(undefined)).toEqual({});
  });

  it('reads days, limit and sort=soonest from query strings', () => {
    expect(parseUpcomingEventsQuery({ days: '30', limit: '3', sort: 'soonest' })).toEqual({
      days: 30,
      limit: 3,
      sort: 'soonest',
    });
  });

  it('refuses values it cannot honour', () => {
    for (const bad of [
      { days: '0' },
      { days: '1.5' },
      { days: '400' },
      { limit: 'x' },
      { limit: '51' },
      { sort: 'asc' },
    ]) {
      expect(() => parseUpcomingEventsQuery(bad)).toThrow(BadRequestException);
    }
  });
});

describe('upcomingEventsFindArgs and toUpcomingEvent (LAB-3071)', () => {
  const NOW = new Date('2026-11-04T10:00:00.000Z');

  it('without options: every event not yet started, newest first, uncapped (the member page widget)', () => {
    expect(upcomingEventsFindArgs({}, NOW)).toEqual({
      where: { startDate: { gt: NOW }, isDeleted: false },
      orderBy: { startDate: 'desc' },
    });
  });

  it('days=30, limit=3, sort=soonest: within 30 days, soonest first, capped', () => {
    expect(upcomingEventsFindArgs({ days: 30, limit: 3, sort: 'soonest' }, NOW)).toEqual({
      where: { startDate: { gt: NOW, lte: new Date('2026-12-04T10:00:00.000Z') }, isDeleted: false },
      orderBy: { startDate: 'asc' },
      take: 3,
    });
  });

  it('maps a row to the shape the endpoint has always returned', () => {
    expect(
      toUpcomingEvent({
        uid: 'e1',
        name: 'FIL Lisbon',
        websiteURL: null,
        startDate: new Date('2026-11-07T09:00:00Z'),
        endDate: new Date('2026-11-08T18:00:00Z'),
        logo: { url: 'https://img/x.png' },
        location: { location: 'Lisbon', flag: 'PT' },
      })
    ).toEqual({
      uid: 'e1',
      name: 'FIL Lisbon',
      websiteUrl: null,
      logo: 'https://img/x.png',
      location: 'Lisbon',
      flag: 'PT',
      startDate: '2026-11-07T09:00:00.000Z',
      endDate: '2026-11-08T18:00:00.000Z',
    });
  });
});
