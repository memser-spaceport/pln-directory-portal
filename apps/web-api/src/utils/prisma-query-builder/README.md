# ◭ Prisma Query Builder

Based on the [TypeORM Express Query Builder](https://github.com/rjlopezdev/typeorm-express-query-builder), it shares the same purpose of automatically transforming URL query parameters parsed from the [qs](https://github.com/ljharb/qs) library (which Express.js makes use of) into [Prisma](https://github.com/prisma) queries.

But it also includes some extra features:

- Generates error-less queries by explicitly knowing which fields are queryable;
- Ordering of relational M2M fields;
- Lookups for nested fields;

_Important note:_
This query builder purposely & silently ignores invalid field names or values that do not match the Prisma field options (shown below) that we explicitly specify to garantee that not a single generated query throws validation errors.

### Usage

1 - Specify which Prisma fields are queryable using the `PrismaQueryableFields` object;

2 - Instantiate the `PrismaQueryBuilder` with the specified queryable fields;

3 - Generate a Prisma query by calling the `build` method with an URL parsed query;

```typescript
import PrismaQueryBuilder from 'src/utils/prisma-query-builder';
import { PrismaQueryableFields } from 'src/utils/prima-query-builder/prisma-fields';

// To ensure any genereted queries don't cause any errors within Prisma,
// we define which Prisma fields are queryable along with some options:
const queryablePrismaFields: PrismaQueryableFields = {
  name: true,
  email: {
    _nullable: true,
  },
  age: {
    _type: 'number'
  },
  online: {
    _type: 'boolean'
  },
  location: {
    address: true,
    country: true,
  },
  posts: {
    _many: true,
    title: true.
    description: {
      _nullable: true
    }
  }
};
const builder = new PrismaQueryBuilder(queryablePrismaFields);
const builtQuery = builder.build(req.query)

// Now that our query is built, we hand it over to the Prisma client
const results = await prisma.users.find(builtQuery)
```

Given the following URL query string:

`foo/?name__contains=foo&role__in=admin,common&age__gte=18&page=3&limit=10`

It will be transformed into:

```typescript
{
  where: {
    name: {
      contains: 'foo'
    },
    role: {
      in: ['admin', 'common']
    },
    age: {
      gte: 18
    }
  },
  skip: 20,
  take: 10
}
```

### Available Lookups

| Lookup          | Behaviour                                                   | Example                  |
| --------------- | ----------------------------------------------------------- | ------------------------ |
| _(none)_        | Return entries that match with value                        | `foo=raul`               |
| **contains**    | Return entries that contains value                          | `foo__contains=lopez`    |
| **startswith**  | Return entries that starts with value                       | `foo__startswith=r`      |
| **endswith**    | Return entries that ends with value                         | `foo__endswith=dev`      |
| **icontains**   | Return entries that contains value and ignoring case        | `foo__icontains=Lopez`   |
| **istartswith** | Return entries that starts with value and ignoring case     | `foo__istartswith=R`     |
| **iendswith**   | Return entries that ends with value and ignoring case       | `foo__iendswith=Dev`     |
| **lt**          | Return entries with value less than or equal to provided    | `foo__lt=18`             |
| **lte**         | Return entries with value less than provided                | `foo__lte=18`            |
| **gt**          | Returns entries with value greater than provided            | `foo__gt=18`             |
| **gte**         | Return entries with value greater than or equal to provided | `foo__gte=18`            |
| **in**          | Return entries that match at least one value on the list    | `foo__in=admin,common`   |
| **with**        | Return entries that match all values on the list            | `foo__with=admin,common` |
| **between**     | Return entries in range (numeric, dates)                    | `foo__between=1,27`      |

**Notice**: you can use negative logic prefixing lookup with `__not`.

_Example:_
`foo__not__contains=value`

### Options

#### Pagination

| Option     | Default  | Behaviour                                                   | Example            |
| ---------- | :------: | ----------------------------------------------------------- | ------------------ |
| pagination | **true** | If _true_, paginate results. If _false_, disable pagination | `pagination=false` |
| page       |  **1**   | Return entries for page `page`                              | `page=2`           |
| limit      |  **25**  | Return entries for page `page` paginated by size `limit`    | `limit=15`         |

#### Ordering

| Option  | Default | Behaviour                                                                    | Example               |
| ------- | :-----: | ---------------------------------------------------------------------------- | --------------------- |
| orderBy | **asc** | Order for fields:<br>Empty becomes Ascendant <br> `-`: Descendant            | `orderBy=email,-name` |
| order   | **asc** | Order for m2m nested fields:<br>Empty becomes Ascendant <br> `-`: Descendant | `order=-posts.title`  |

#### Selection

| Option | Default | Behaviour                                                            | Example                          |
| ------ | :-----: | -------------------------------------------------------------------- | -------------------------------- |
| select |    -    | Fields to select as response. If no provided, it selects all fields. | `select=name,surname,foo.nested` |
| with   |    -    | Entity relations to attach to query                                  | `with=posts,comments`            |

### Profile

If you need to disable some capabilities, you can do using shortcuts to `enable|disable` by default or provide a custom Profile.

A Profile describe capabilities that can be used by clients & its behaviour.

```typescript
const qb = new PrismaQueryBuilder(
  prismaFieldOptions,
  'enabled' | 'disabled' | ConfigProgile
);
```

#### ConfigProfile

`ConfigProfile` object looks like:

```typescript
const customProfile: ConfigProfile = {
  options: {
    pagination: {
      status: 'enabled',
      paginate: true,
      itemsPerPage: 25,
    },
    ordering: {
      status: 'enabled',
    },
    relations: {
      status: 'enabled',
    },
    select: {
      status: 'enabled',
    },
  },
  policy: 'skip',
};
```

| Field   |  Default  | Behaviour                                                  | Type             |
| ------- | :-------: | ---------------------------------------------------------- | ---------------- |
| options | 'enabled' | Profile options                                            | `ProfileOptions` |
| policy  |  'skip'   | Policy to apply in cases client try use `disabled` options | `FindPolicyType` |
