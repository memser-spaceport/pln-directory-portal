import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { createTeam } from './__mocks__/teams.mocks';
import { createMember } from '../members/__mocks__/members.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';
import { FollowsService } from '../follows/follows.service';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';

class TestUserTokenCheckGuard {
  constructor(private readonly email?: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (this.email) {
      request['userEmail'] = this.email;
      request['userUid'] = 'uid-1';
    }
    return true;
  }
}

async function bootstrapTeamsFollowingApp(memberEmail?: string) {
  return bootstrapTestingApp({
    providers: [
      {
        provide: UserTokenCheckGuard,
        useValue: new TestUserTokenCheckGuard(memberEmail),
      },
    ],
  });
}

describe('Teams search following filter', () => {
  let app: INestApplication;
  let cacheManager: Cache;
  let followsService: FollowsService;

  describe('unauthenticated', () => {
    beforeEach(async () => {
      ({ app, cacheManager } = await bootstrapTeamsFollowingApp());
      await app.init();
      followsService = app.get(FollowsService);
      await cacheManager.reset();
      await createTeam({ amount: 5 });
      await createMember({ amount: 1 });
    });

    afterAll(async () => {
      await app.close();
      await cacheManager.reset();
    });

    it('returns empty results for followingOnly=true', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/teams-search?followingOnly=true').expect(200);

      expect(response.body.total).toBe(0);
      expect(response.body.followingTotal).toBe(0);
      expect(response.body.teams).toEqual([]);
    });

    it('returns isFollowed=false on team detail', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/teams/uid-1').expect(200);

      expect(response.body.isFollowed).toBe(false);
    });
  });

  describe('authenticated as email-1@mail.com', () => {
    beforeEach(async () => {
      ({ app, cacheManager } = await bootstrapTeamsFollowingApp('email-1@mail.com'));
      await app.init();
      followsService = app.get(FollowsService);
      await cacheManager.reset();
      await createTeam({ amount: 5 });
      await createMember({ amount: 1 });
    });

    afterAll(async () => {
      await app.close();
      await cacheManager.reset();
    });

    async function followTeams(teamUids: string[]) {
      for (const teamUid of teamUids) {
        await followsService.followTeam('uid-1', teamUid);
      }
    }

    it('returns only followed teams when followingOnly=true', async () => {
      await followTeams(['uid-1', 'uid-2']);

      const response = await supertest(app.getHttpServer()).get('/v1/teams-search?followingOnly=true').expect(200);

      expect(response.body.total).toBe(2);
      expect(response.body.followingTotal).toBe(2);
      expect(response.body.teams.map((t: { uid: string }) => t.uid).sort()).toEqual(['uid-1', 'uid-2']);
      expect(response.body.teams.every((t: { isFollowed: boolean }) => t.isFollowed === true)).toBe(true);
    });

    it('intersects followingOnly with searchBy', async () => {
      await followTeams(['uid-1', 'uid-2']);

      const response = await supertest(app.getHttpServer())
        .get('/v1/teams-search?followingOnly=true&searchBy=Team+1')
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.followingTotal).toBe(1);
      expect(response.body.teams).toHaveLength(1);
      expect(response.body.teams[0].uid).toBe('uid-1');
    });

    it('returns followingTotal without followingOnly', async () => {
      await followTeams(['uid-1', 'uid-3']);

      const response = await supertest(app.getHttpServer()).get('/v1/teams-search').expect(200);

      expect(response.body.total).toBe(5);
      expect(response.body.followingTotal).toBe(2);
      const followed = response.body.teams.filter((t: { isFollowed: boolean }) => t.isFollowed);
      expect(followed.map((t: { uid: string }) => t.uid).sort()).toEqual(['uid-1', 'uid-3']);
    });

    it('returns empty list when member follows nothing and followingOnly=true', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/teams-search?followingOnly=true').expect(200);

      expect(response.body.total).toBe(0);
      expect(response.body.followingTotal).toBe(0);
      expect(response.body.teams).toEqual([]);
    });

    it('returns isFollowed=true on team detail when followed', async () => {
      await followTeams(['uid-1']);

      const response = await supertest(app.getHttpServer()).get('/v1/teams/uid-1').expect(200);

      expect(response.body.isFollowed).toBe(true);
    });

    it('returns isFollowed=false on team detail when not followed', async () => {
      await followTeams(['uid-2']);

      const response = await supertest(app.getHttpServer()).get('/v1/teams/uid-1').expect(200);

      expect(response.body.isFollowed).toBe(false);
    });
  });
});
