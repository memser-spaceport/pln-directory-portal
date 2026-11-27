import { initContract } from '@ts-rest/core';
import { MemberInviteLinkSchema } from '../schema/member-invite';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiMemberInvite = contract.router({
  getMyInviteLink: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/me/invite-link`,
    responses: {
      200: MemberInviteLinkSchema,
    },
    summary: "Get the signed-in member's reusable invite link",
  },
});
