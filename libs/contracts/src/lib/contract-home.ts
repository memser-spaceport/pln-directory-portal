import { initContract } from '@ts-rest/core';
import { getAPIVersionAsPath } from '../utils/versioned-path';
import {
  QuestionAndAnswerQueryParams,
  ResponseQuestionAndAnswerSchemaWithRelations
} from '../schema';
const contract = initContract();

export const apiHome = contract.router({
  getAllFeaturedData: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/home/featured/all`,
    query: contract.query,
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Get all featured members, projects, teams and events'
  },
  getAllQuestionAndAnswers: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/home/question-answers`,
    query: QuestionAndAnswerQueryParams,
    responses: {
      200: ResponseQuestionAndAnswerSchemaWithRelations.array()
    },
    summary: 'Get all the question & answers',
  },
  getQuestionAndAnswer: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/home/question-answers/:slug`,
    query: QuestionAndAnswerQueryParams,
    responses: {
      200: ResponseQuestionAndAnswerSchemaWithRelations.array()
    },
    summary: 'Get question & answers',
  },
  createQuestionAndAnswer: {
    method: 'POST',
    path: `${getAPIVersionAsPath('1')}/home/question-answers`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Create a new question & answer',
  },
  updateQuestionAndAnswer: {
    method: 'PUT',
    path: `${getAPIVersionAsPath('1')}/home/question-answers/:slug`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Update a question & answer by slug'
  },
  updateQuestionAndAnswerViewCount: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/home/question-answers/:slug/view-count`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Update view count of a question & answer by slug'
  },
  updateQuestionAndAnswerShareCount: {
    method: 'PATCH',
    path: `${getAPIVersionAsPath('1')}/home/question-answers/:slug/share-count`,
    body: contract.body<unknown>(),
    responses: {
      200: contract.response<unknown>()
    },
    summary: 'Update share count of a question & answer by slug'
  }
});
