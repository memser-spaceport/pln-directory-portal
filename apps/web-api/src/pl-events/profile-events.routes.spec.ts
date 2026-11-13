// The real services and guards overflow ts-jest's type check (TS 4.7); they are stubbed, as in pl-events.routes.spec.ts.
// The controller, its query parsing and Nest's router are real.
jest.mock('../guards/user-token-check.guard', () => ({
  OptionalUserTokenCheckGuard: class {
    canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      const email = req.headers['x-test-email'];
      if (email) req.userEmail = email;
      return true;
    }
  },
}));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('./profile-events.service', () => ({ ProfileEventsService: class {} }));

import { ForbiddenException, INestApplication, Module, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { MembersService } from '../members/members.service';
import { ProfileEventsController } from './profile-events.controller';
import { ProfileEventsService } from './profile-events.service';

/** LAB-3215: `GET /v1/members/:uid/events` and `GET /v1/teams/:uid/events` through Nest's router. */
describe('profile events routes (LAB-3215)', () => {
  let app: INestApplication;
  const profileEvents = {
    getMemberEvents: jest.fn(async (uid: string) => ({ past: { page: 1, limit: 4, total: 0, items: [] }, uid })),
    getTeamEvents: jest.fn(async (uid: string) => ({ past: { page: 1, limit: 4, total: 0, items: [] }, uid })),
  };
  const members = {
    findMemberByEmail: jest.fn(async (email: string) => (email === 'v@x.io' ? { uid: 'viewer' } : null)),
  };

  beforeAll(async () => {
    @Module({
      controllers: [ProfileEventsController],
      providers: [
        { provide: ProfileEventsService, useValue: profileEvents },
        { provide: MembersService, useValue: members },
      ],
    })
    class RoutesTestModule {}
    app = await NestFactory.create(RoutesTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('/v1/members/:uid/events reaches the member handler with the parsed query, signed out', async () => {
    const res = await request(app.getHttpServer()).get('/v1/members/m1/events?group=past&limit=10').expect(200);
    expect(res.body.uid).toBe('m1');
    expect(profileEvents.getMemberEvents).toHaveBeenCalledWith('m1', null, { group: 'past', page: 1, limit: 10 });
  });

  it('/v1/members/:uid/events resolves the signed-in viewer', async () => {
    await request(app.getHttpServer()).get('/v1/members/m1/events').set('x-test-email', 'v@x.io').expect(200);
    expect(profileEvents.getMemberEvents).toHaveBeenCalledWith('m1', { uid: 'viewer' }, { page: 1, limit: 4 });
  });

  it('/v1/teams/:uid/events reaches the team handler with the viewer and email', async () => {
    const res = await request(app.getHttpServer()).get('/v1/teams/t1/events').set('x-test-email', 'v@x.io').expect(200);
    expect(res.body.uid).toBe('t1');
    expect(profileEvents.getTeamEvents).toHaveBeenCalledWith('t1', { uid: 'viewer' }, 'v@x.io', { page: 1, limit: 4 });
  });

  it('rejects limit=51 with 400 before any read', async () => {
    await request(app.getHttpServer()).get('/v1/members/m1/events?limit=51').expect(400);
    await request(app.getHttpServer()).get('/v1/teams/t1/events?limit=51').expect(400);
    expect(profileEvents.getMemberEvents).not.toHaveBeenCalled();
    expect(profileEvents.getTeamEvents).not.toHaveBeenCalled();
  });

  it('passes 403 for an L0 team and 404 for an unknown member or team', async () => {
    profileEvents.getTeamEvents.mockRejectedValueOnce(new ForbiddenException('Team is inactive'));
    const forbidden = await request(app.getHttpServer()).get('/v1/teams/t-l0/events').expect(403);
    expect(forbidden.body.message).toBe('Team is inactive');
    profileEvents.getTeamEvents.mockRejectedValueOnce(new NotFoundException('Team not found'));
    await request(app.getHttpServer()).get('/v1/teams/nope/events').expect(404);
    profileEvents.getMemberEvents.mockRejectedValueOnce(new NotFoundException('Member not found'));
    await request(app.getHttpServer()).get('/v1/members/nope/events').expect(404);
  });

  it('marks both handlers as not cached (@NoCache)', () => {
    const proto = ProfileEventsController.prototype;
    expect(Reflect.getMetadata('ignoreCaching', proto.getMemberEvents)).toBe(true);
    expect(Reflect.getMetadata('ignoreCaching', proto.getTeamEvents)).toBe(true);
  });

  it('no other contract route claims /members/:x/events or /teams/:x/events', () => {
    const dir = join(__dirname, '../../../../libs/contracts/src/lib');
    const claims = readdirSync(dir)
      .filter((file) => file.endsWith('.ts'))
      .flatMap((file) =>
        (readFileSync(join(dir, file), 'utf8').match(/\/(members|teams)\/:[A-Za-z]+\/events\b/g) ?? []).map(
          (path) => `${file} ${path}`
        )
      );
    expect(claims.sort()).toEqual([
      'contract-pl-events.ts /members/:uid/events',
      'contract-pl-events.ts /teams/:uid/events',
    ]);
  });
});
