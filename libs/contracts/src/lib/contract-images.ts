import { initContract } from '@ts-rest/core';
import { ResponseCreateImageSchema, ResponseImageSchema } from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiImages = contract.router({
  getImages: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/images`,
    responses: {
      200: ResponseImageSchema.array(),
    },
    summary: 'Get all images',
  },
  getImage: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/images/:uid`,
    responses: {
      200: ResponseImageSchema,
    },
    summary: 'Get an image',
  },
  uploadImage: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/images`,
    contentType: 'multipart/form-data', // <- Only difference
    body: contract.body<{ image: File }>(), // <- Use File type in here
    responses: {
      200: ResponseCreateImageSchema,
    },
    summary: 'Upload an image',
  },
});
