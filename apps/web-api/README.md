## Description

This is the PL Network backend built with [Nest](https://github.com/nestjs/nest), [Prisma](https://www.prisma.io/) and [PostgresSQL](https://www.postgresql.org/).

### Installation

```bash
$ yarn install

# Setup docker for postgres
$ docker-compose up -d
```

### Add local environment variables

1 - Create the environment variables file:

```bash
# ~/protocol-labs-network
cp .env.example .env
```

2 - Copy the variables from this [1Password secure note](https://start.1password.com/open/i?a=RHJRUUECTJFG3A24NTR5KGKPZU&v=st4nf6p3qb35zzgc4hqwxyixra&i=7kuen7hvpjfstldqyenosgryza&h=pixelmatters.1password.com).

### Generate Prisma Schemas and update the database

```bash
$ npx prisma generate --schema=./apps/web-api/prisma/schema.prisma

$ npx prisma db push --schema=./apps/web-api/prisma/schema.prisma
```

### Populate a database with mock data

⚠️ **Keep in mind that running the following command completely wipes the database before inserting any mock data.**

ℹ️ Before running the following command make sure that your [database is in sync with your Prisma schema](#generate-prisma-schemas-and-update-the-database).

```bash
$ yarn nx seed web-api
```

### Running the app

```bash
# development
$ yarn nx serve web-api

# production mode
$ yarn nx build web-api --configuration=production
```

### Test

```bash
$ nx run web-api:test
```

### Lint

```bash
$ nx run web-api:lint
```

### Full type safety endpoint development

For more information on this access the contracts lib documentation [here](../../libs/contracts/README.md).
