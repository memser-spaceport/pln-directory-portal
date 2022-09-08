## Description

This is the PL Network backend built with [Nest](https://github.com/nestjs/nest), [Prisma](https://www.prisma.io/) and [PostgresSQL](https://www.postgresql.org/).

## Installation

```bash
$ yarn install

# Setup docker for postgres
$ docker-compose up -d
```

## Generate Prisma Schemas and update db

```bash
$ npx prisma generate --schema=./apps/web-api/prisma/schema.prisma

$ npx prisma db push --schema=./apps/web-api/prisma/schema.prisma
```

## Running the app

```bash
# development
$ yarn nx serve web-api

# production mode
$ yarn nx build web-api --configuration=production
```

## Test

```bash
$ nx run web-api:test
```

## Lint

```bash
$ nx run web-api:lint
```
