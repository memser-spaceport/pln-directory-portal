## Full type safety endpoint development

For full-type safety endpoint development we use the [ts-rest package](https://github.com/ts-rest/ts-rest). The goal of this library is to provide a way to develop endpoints with full type safety. This means that the request and response of the endpoints will be typed and validated against the schemas.

For schema validation we use:

1. [zod](https://github.com/colinhacks/zod)
2. [nestjs-zod](https://github.com/risenforces/nestjs-zod)

## Development Steps

### Create a file for the endpoint inside the `schemas` folder and create the zod schemas

```ts
export const FundingStageSchema = z.object({
  id: z.number().int(),
  uid: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
```

### Create the relevant API endpoint schemas that derive from the model schema

```ts
import { QueryParams, RETRIEVAL_QUERY_FILTERS } from './query-params';

// Get schema, always omit the id field
export const GetFundingStageSchema = FundingStageSchema.omit({
  id: true,
}).strict();

// Create schema, only pick the fields that are required for creation
export const CreateFundingStageSchema = FundingStageSchema.pick({
  title: true,
});

/**
 * Create the relevant constants that feed the Prisma Query Builder:
 * apps/web-api/src/utils/prisma-query-builder/README.md
 */
export const FundingStageQueryableFields = GetFundingStageSchema.keyof();

export const FundingStageQueryParams = QueryParams({
  queryableFields: FundingStageQueryableFields,
});

export const FundingStageDetailQueryParams = FundingStageQueryParams.unwrap()
  .pick(RETRIEVAL_QUERY_FILTERS)
  .optional();
```

### Create a new contract file inside the `libs/contracts/src/contracts` folder.

```ts
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  FundingStageDetailQueryParams,
  FundingStageQueryParams,
  GetFundingStageSchema,
} from '../schema';
import { getAPIVersionAsPath } from '../utils/versioned-path';

const contract = initContract();

export const apiFundingStages = contract.router({
  getFundingStages: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/funding-stages`,
    query: FundingStageQueryParams,
    responses: {
      200: GetFundingStageSchema.array(),
    },
    summary: 'Get all funding stages',
  },
  getFundingStage: {
    method: 'GET',
    path: `${getAPIVersionAsPath('1')}/funding-stages/:uid`,
    query: FundingStageDetailQueryParams,
    responses: {
      200: GetFundingStageSchema,
    },
    summary: 'Get a funding stage',
  },
});
```

### Add the new contract to the `contract-nested.ts` file

```ts
export const apiNested = contract.router({
  /**
   * ...
   */
  fundingStages: apiFundingStages,
});
```

## Schema Testing: API Endpoints

Through an E2E test, we can ensure an API response adheres to a schema by calling the [`safeParse`](https://github.com/colinhacks/zod#safeparse) method available on all zod schemas.

Bellow is an example of and e2e test that uses the `safeParse` method to test the response of the endpoint against the schema.

```ts
it('should list all the members with a valid schema', async () => {
  const response = await supertest(app.getHttpServer())
    .get('/v1/members')
    .expect(200);
  const members = response.body;
  expect(members).toHaveLength(5);
  const hasValidSchema =
    ResponseMemberWithRelationsSchema.array().safeParse(members).success;
  expect(hasValidSchema).toBeTruthy();
});
```

## Making use of the ts-rest client

When implementing on the client side, the client from '@ts-rest/core' will be able to use the generated types to make the request and handle the response.

```ts
const client = initClient(apiFundingStages, {
  baseUrl: 'http://localhost:3000',
  baseHeaders: {},
});

const data = await client.getFundingStage({
  params: { uid: '1' },
});

// Verify the status code to type the response
if (data.status === 200) {
  data.body.uid;
}
```

> **ℹ️ Note**
>
> Something to be aware of is that we first need to verify the status code of the response before accessing the body. This is because the body only has the appropriate type inferred depending on the status code of the response by the ts-rest library.
