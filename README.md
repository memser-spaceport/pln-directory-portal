# Directory Backend

This is the PL Network backend built with [Nest](https://github.com/nestjs/nest), [Prisma](https://www.prisma.io/), and [PostgresSQL](https://www.postgresql.org/). The parent project is generated using [Nx](https://nx.dev/). Check the docs to learn more.

It is set up in monorepo (soon will be revamped to single microservice pattern) fashion currently hosting directory backend and directory frontend for admin (soon will be revamped).

The actual frontend for directory has been moved [here](https://github.com/memser-spaceport/pln-directory-portal-v2).

## Folder Structure

The folder structure of this project is organized as follows:

- **apps/web-api**: Contains the actual backend service
- **apps/web-api/prisma**: Contains the database schema and migration files
- **libs/contracts**: Contains the API contracts

## Logging in Cloudwatch

The application is set to send all the logs to Cloudwatch logs. If you have your own AWS access and secret keys with Cloudwatch permissions, you can configure them in `.env`.

If you do not want to log in Cloudwatch, you can set `LOG_ENV=local`.

## Setting up Dependent Services

| Name | Type | Purpose | Mandatory |
| - | - | - | - |
| [Privy](https://www.privy.io/) | External | The hybrid auth solution provider for users to login | Yes |
| AWS Cloudwatch logs | External | To store logs | No |
| AWS S3 | External | To store runtime images like profile pictures | Yes (can use default S3 location in `.env.example` for local development) |
| AWS SES | External | To send email notifications | Yes |
| PL Auth service (sandbox mode) | Internal | To manage user auth requests and issue tokens, works in OAuth 2.0 standard | Yes |
| Redis | External | To cache API results for better performance | Yes |
| Google API | External | For location-based services | Yes |
| [Forestadmin](https://www.forestadmin.com/) | External | To manage data directly from/to database. The admin panel for the database | No |
| Github API Key | External | To get information about projects from Github repo | Yes |

## Installation

```sh
$ yarn install
```

### Setup Docker for Postgres and Redis

Install [Docker](https://docs.docker.com/engine/install/) and [Docker Compose](https://docs.docker.com/compose/install/).

Then run:

```sh
$ docker-compose up -d
```

Once this is done, you will have your Postgres and Redis running through Docker and they will be up and running based on the following configurations:

- Sample values through which Docker will run Postgres and Redis:
  ```sh
  DB_HOST_PORT=19432
  DB_USER=postgres
  DB_PASSWORD=postgres
  DB_NAME=plnetwork_dev
  DATABASE_URL=postgresql://postgres:postgres@localhost:19432/plnetwork_dev

  REDIS_HOST=localhost
  REDIS_PORT=6379
  ```

## Add Local Environment Variables

1. Create the environment variables file:
    ```sh
    # ~/protocol-labs-network
    cp .env.example .env
    ```

### Some Key Environment Variables for Local Mode

- Generate a Github [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens):
  ```sh
  GITHUB_API_KEY=
  ```

- Make sure it has permission to read and write from the provided S3 bucket:
  ```sh
  AWS_ACCESS_KEY=
  AWS_SECRET_KEY=
  ```

- Must be a public bucket:
  ```sh
  AWS_S3_BUCKET_NAME=
  ```

## Generate Prisma Schemas and Update the Database

```sh
$ npx prisma generate --schema=./apps/web-api/prisma/schema.prisma
$ npx prisma db push --schema=./apps/web-api/prisma/schema.prisma
```

## Populate a Database with Mock Data

⚠ Keep in mind that running the following command completely wipes the database before inserting any mock data.

ℹ Before running the following command, make sure that your [database is in sync with your Prisma schema](https://github.com/memser-spaceport/pln-directory-portal/blob/main/apps/web-api/README.md#generate-prisma-schemas-and-update-the-database).

```sh
$ yarn nx seed web-api
```

## Running the App

Go to the parent folder:

### Development

```sh
$ yarn nx serve web-api
```

### Production Mode

```sh
$ yarn nx build web-api --configuration=production
```

## Test

```sh
$ nx run web-api:test
```

## Lint

```sh
$ nx run web-api:lint
```