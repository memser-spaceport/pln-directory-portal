import { initContract } from "@ts-rest/core";
import { getAPIVersionAsPath } from "../utils/versioned-path";


const contract = initContract();


export const apiHusky = contract.router({
  uploadDocument: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/husky/document/upload`,
    contentType: 'multipart/form-data',
    body: contract.body<{ file: File }>(),
    responses: {
      200: contract.response<{ message: string }>(),
    },
    summary: 'Upload a document',
  },
});

