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
