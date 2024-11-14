# Directory Backend

This is the PL Network backend built with [Nest](https://github.com/nestjs/nest), [Prisma](https://www.prisma.io/), and [PostgreSQL](https://www.postgresql.org/). The parent project is generated using [Nx](https://nx.dev/). Check the docs to learn more.

It is set up in monorepo (soon will be revamped to single microservice pattern) fashion currently hosting directory backend and directory frontend for admin (soon will be revamped).

The actual frontend for directory has been moved [here](https://github.com/memser-spaceport/pln-directory-portal-v2).

## Folder Structure

The folder structure of this project is organized as follows:

- **apps/web-api**: Contains the actual backend service
- **apps/web-api/prisma**: Contains the database schema and migration files
- **libs/contracts**: Contains the API contracts

---

## Prerequisites

Before running this project, ensure the following software is installed on your system:

1. **Docker**  
   Docker is essential for containerizing the application, making it easier to manage dependencies and deployments.  
   [Install Docker](https://docs.docker.com/get-docker/)

2. **Docker Compose**  
   Docker Compose is a tool for defining and running multi-container Docker applications, which allows for easier orchestration of containers.  
   [Install Docker Compose](https://docs.docker.com/compose/install/)

3. **PostgreSQL**  
   PostgreSQL is the primary database used in this project. Make sure to have it installed and configured, or use the Docker image provided in the `docker-compose.yml` file.  
   [Install PostgreSQL](https://www.postgresql.org/download/)

4. **Redis**  
   Redis is used for caching, which improves performance and scalability. You can also run Redis as a Docker container if you prefer.  
   [Install Redis](https://redis.io/download)

5. **Node.js**  
   Node.js is the JavaScript runtime for server-side scripting in this project. Ensure that a compatible version is installed.  
   [Install Node.js](https://nodejs.org/)

6. **npm (Node Package Manager) and Yarn**  
   npm is included with Node.js and is used for installing dependencies and managing packages.  
   [Learn about npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
   [Install Yarn](https://classic.yarnpkg.com/lang/en/docs/install/)

7. **NestJS**  
   NestJS is a framework for building efficient, reliable, and scalable server-side applications. It is the primary framework used in this project.  
   [Learn about NestJS](https://docs.nestjs.com/)

8. **Prisma**  
   Prisma is an ORM (Object-Relational Mapper) used for interacting with the database in a type-safe way.  
   [Learn about Prisma](https://www.prisma.io/docs/)

9. **Zod**  
   Zod is a TypeScript-first schema validation library used for data validation.  
   [Learn about Zod](https://zod.dev/)

--- 

## Logging in Cloudwatch

The application is set to send all the logs to Cloudwatch logs. If you have your own AWS access and secret keys with Cloudwatch permissions, you can configure them in `.env`.

If you do not want to log in CloudWatch or do not have the necessary AWS keys, you can set `LOG_ENV=local`.

## Setting up Dependent Services

| Name | Type | Purpose | Mandatory |
| - | - | - | - |
| [Privy](https://www.privy.io/) | External | The hybrid auth solution provider for users to login | Yes, for local we have already provided you with a client id, just use that |
| AWS Cloudwatch logs | External | To store logs | No |
| AWS S3 | External | To store runtime images like profile pictures | Yes (You can skip it for local development but you will not be able to upload profile images) |
| AWS SES | External | To send email notifications | Yes, but you can skip in local by disabling email in .env |
| PL Auth service | Internal | To manage user auth requests and issue tokens, works in OAuth 2.0 standard | Yes, for local we have provided you with sandbox url |
| [Google API](https://developers.google.com/maps/documentation/places/web-service/get-api-key) | External | For location-based services | Yes |
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

  ```sh
  ENVIRONMENT=development
  ```

- Generate a Github [personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens):
  ```sh
  GITHUB_API_KEY=
  ```

- Make sure it has permission to read and write from the provided S3 bucket (If you do not have aws keys, leave it assuming you will not be uploading any profile images):
  ```sh
  AWS_ACCESS_KEY=
  AWS_SECRET_KEY=
  ```

- Must be a public bucket: (Leave it if you do not have any)
  ```sh
  AWS_S3_BUCKET_NAME=
  ```

- Set to false if you do not have aws keys with ses permission
  ```sh
  IS_EMAIL_ENABLED=false
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
$ yarn nx run web-api:test
```
To ensure code reliability and functionality, we use the Jest framework for writing and running test cases. Jest provides a robust environment for unit and integration testing, helping maintain the quality and stability of the application.

## Lint

```sh
$ yarn nx run web-api:lint```


### Full type safety endpoint development

For more information on this access the contracts lib documentation [here](./libs/contracts/README.md).
