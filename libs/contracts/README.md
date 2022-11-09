## Full type safety endpoint development

https://github.com/ts-rest/ts-rest

Schema Validation:
https://github.com/colinhacks/zod
https://github.com/risenforces/nestjs-zod

Create a file for the endpoint inside the `schemas` folder and create the zod schemas

```ts
export const MemberModel = z.object({
  id: z.number().int(),
  uid: z.string(),
  name: z.string(),
});
```

Generate a dto object from the schema inside the same file

```ts
export class MemberDto extends createZodDto(MemberModel) {}
```

Create different schema objects to represent the necessary body for each endpoint and associate them with the dto object still inside the same file

```ts
export const CreateMemberModel = MemberModel.pick({
  name: true,
  email: true,
  image: true,
});

export class CreateMemberModelDto extends createZodDto(CreateMemberModel) {}
```

Create a new contract file inside the libs/contracts/src/contracts folder.

```ts
import { z } from 'zod';
import { initContract } from '@ts-rest/core';
import { CreateMemberModel, MemberModel } from '../schema';

const contract = initContract();

export const apiMember = contract.router({
  createMember: {
    method: 'POST',
    path: '/',
    responses: {
      201: MemberModel,
    },
    body: CreateMemberModel,
    summary: 'Create a member',
  },
});
```

Finally add the new contract to the contract-nested.ts file

```ts
export const apiNested = contract.router({
  /**
   * Members API
   */
  members: apiMembers,
  /**
   * Teams API
   */
  teams: apiTeams,
  /**
   * Health API
   */
  health: apiHealth,
});
```

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

Something to be aware of is that we first need to verify the status code of the response before accessing the body. This is because the body is only gets typed depeding on the status code of the response by the ts-rest library.
