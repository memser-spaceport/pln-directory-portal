# Guidelines for API Tests

API testing is a crucial aspect of web development that aims to ensure the functionality, reliability, and security of a web API. Our API tests are divided into two major sets: End-to-End (E2E) tests and Unit tests.

## End-to-End (E2E) Tests

End-to-End tests are tests that cover the entire API flow, from the endpoint call to the back-end response. They are used to test the functionality of our API as a whole.

### E2E Test Structure

E2E tests are written in TypeScript and are located inside each endpoint folder with the structure `endpoint.e2e.spec.ts`.

```
| endpoint/
  |-- endpoint.ts
  |-- endpoint.e2e.spec.ts
```

Each test file is named after the endpoint it tests. For example, the `apps/web-api/src/members/members.e2e.spec.ts` file tests the `/members` endpoint.

Examples of E2E tests include:

- Testing the endpoints response against our defined schemas;
- Testing the endpoints response against our defined error codes;
- Testing the endpoints response against an expected response to void unwanted changes to the endpoint.

```ts
import { ResponseMemberWithRelationsSchema } from 'libs/contracts/src/schema';
import supertest from 'supertest';

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

## Unit Tests

Unit tests are tests that are written for individual units of code. They are used to test the functionality of a single unit of code. Unit tests are written in TypeScript and are located in the inside each component folder with the structure `component.spec.ts`.

We make use of these tests to test the functionality of our components, services, and utilities.

It is meant to test the functionality of a single unit of code and provide a safe net for refactoring code.

```ts
it('should not conceal ids', () => {
  const responseData = 'String with id: 123';
  const finalResponse = concealEntityIDInterceptor.intercept(
    contextMock,
    getNextMock(responseData)
  );
  expect(finalResponse).toBe(responseData);
});
```

## Creating Mocks

We use [Fishery](https://github.com/thoughtbot/fishery) to create mocks for our tests. This allows us to create mocks for our data models and use them in our tests.

### Creating a Mock Factory

To create a mock factory, we use the `define` function from Fishery. This function takes in a model and returns a factory that can be used to create mocks.

```ts
import { Factory } from 'fishery';
import { Member } from '@web-api/models'

export const memberFactory = Factory.define<Member>(() => ({
  id: 1,
  name: 'John Doe',
  email: 'email@email.com'
  githubHandler: 'johndoe',
  discordHandler: 'johndoe',
}))
```

These mocks are normally used in our E2E tests and are defined inside a `__mocks__` folder inside the endpoints folder.
