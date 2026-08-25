import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import {
  ApplyMemberCvImportSchema,
  ApplyMemberCvImportResponseSchema,
  MemberCvImportAcceptedSchema,
  MemberCvImportLatestSchema,
} from '../schema/member-cv-import';

const contract = initContract();

export const apiMemberCvImports = contract.router({
  uploadMemberCvImport: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/cv-imports`,
    body: contract.body<unknown>(),
    responses: {
      202: MemberCvImportAcceptedSchema,
    },
    summary: 'Upload a CV PDF and start an asynchronous parse',
  },
  getLatestMemberCvImport: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/members/:uid/cv-imports/latest`,
    responses: {
      200: MemberCvImportLatestSchema,
    },
    summary: 'Get the latest CV upload/parse status for a member',
  },
  applyMemberCvImport: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/members/:uid/cv-imports/apply`,
    body: ApplyMemberCvImportSchema,
    responses: {
      200: ApplyMemberCvImportResponseSchema,
    },
    summary: 'Apply the reviewed CV parse subset to the member profile',
  },
});
