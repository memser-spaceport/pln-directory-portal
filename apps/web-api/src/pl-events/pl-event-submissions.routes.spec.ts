// The route metadata is read from the real controller; its collaborators are stubbed (see pl-events.routes.spec.ts).
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('./pl-events.service', () => ({ PLEventsService: class {} }));
jest.mock('./pl-event-write.service', () => ({ PLEventWriteService: class {} }));

import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { PLEventSubmissionsController } from './pl-event-submissions.controller';
import { isLocalEventSubmitEnabled } from './pl-event-submit.constants';

const guardsOf = (handler: unknown) => Reflect.getMetadata('__guards__', handler as object) ?? [];
const routes = PLEventSubmissionsController.prototype;

describe('event submission routes: guards and limits', () => {
  it('submit needs a user token and answers 201', () => {
    expect(guardsOf(routes.submitPLEvent)).toEqual([UserTokenValidation]);
    expect(Reflect.getMetadata('__httpCode__', routes.submitPLEvent)).toBe(201);
  });

  it('my events, edit and delete need a user token', () => {
    for (const handler of [routes.getMyPLEvents, routes.updatePLEvent, routes.deletePLEvent]) {
      expect(guardsOf(handler)).toEqual([UserTokenValidation]);
    }
  });

  it('no route is cached', () => {
    for (const handler of [routes.submitPLEvent, routes.getMyPLEvents, routes.updatePLEvent, routes.deletePLEvent]) {
      expect(Reflect.getMetadata('ignoreCaching', handler)).toBe(true);
    }
  });

  it('the flag is on only for "true", in any case (the deploy writes it as "True")', () => {
    for (const value of ['true', 'True', 'TRUE', ' true ']) {
      expect(isLocalEventSubmitEnabled({ EVENTS_LOCAL_SUBMIT_ENABLED: value })).toBe(true);
    }
    for (const value of [undefined, '', 'false', 'False', '1', 'yes']) {
      expect(isLocalEventSubmitEnabled({ EVENTS_LOCAL_SUBMIT_ENABLED: value })).toBe(false);
    }
  });
});
