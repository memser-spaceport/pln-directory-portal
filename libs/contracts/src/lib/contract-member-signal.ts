import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { MemberSignalBodySchema } from '../schema/member-signal';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiMemberSignals = contract.router({
  recordMemberSignal: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/member-signals`,
    body: MemberSignalBodySchema,
    responses: {
      204: z.undefined(),
    },
    summary: 'Record a view or click of the logged-in member (fire-and-forget)',
  },
});
