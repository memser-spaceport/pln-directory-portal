import { PrismaClient } from '@prisma/client';
import { IS_DEV_ENVIRONMENT } from 'apps/web-api/src/utils/constants';
import { execSync } from 'child_process';
import { join } from 'path';
import { URL } from 'url';
import { v4 } from 'uuid';

const defaultPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

// Retrieves the full database URL with the provided schema name
const generateDatabaseURL = (newId: string) => {
  if (!sourceUrl) {
    throw new Error('please provide a database url');
  }
  const currentUrl = /:\d+\/(?<name>\w+)(\??)/.exec(sourceUrl);
  const databaseName = currentUrl?.groups?.name || '';
  const newUrl = new URL(
    IS_DEV_ENVIRONMENT ? sourceUrl.replace(databaseName, newId) : sourceUrl
  );
  if (!IS_DEV_ENVIRONMENT) {
    newUrl.searchParams.append('schema', newId);
  }
  return newUrl.toString();
};

//  Build a new database URL from a randomly generated schema name:
let baseId;
const newId = `test-${v4()}`;
const prismaBinary = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'node_modules',
  '.bin',
  'prisma'
);
const schemaPath = join(__dirname, '..', 'schema.prisma');
const sourceUrl = process.env.DATABASE_URL || '';
const url = generateDatabaseURL(newId);

// Reassign the default database URL environment variable from the newly generated URL:
process.env.DATABASE_URL = url;

// Build a new ORM instance from the newly generated URL:
export const prisma = new PrismaClient({
  datasources: { db: { url } },
});

const getDatabaseUrlWithoutParams = (dbUrl: string) => dbUrl.split('?')[0];

// Create the base database to clone from:
beforeAll(async () => {
  if (!IS_DEV_ENVIRONMENT) return;
  baseId = `original-${v4()}`;
  await defaultPrisma.$executeRawUnsafe(`CREATE DATABASE "${baseId}";`);
  execSync(
    `pg_dump --no-owner --no-privileges --if-exists --clean --schema-only ${getDatabaseUrlWithoutParams(
      sourceUrl
    )} | psql ${getDatabaseUrlWithoutParams(url.replace(newId, baseId))}`
  );
});

// Create a new & isolated database right before running each test
beforeEach(async () => {
  if (!IS_DEV_ENVIRONMENT) {
    execSync(`${prismaBinary} db push --schema=${schemaPath}`, {
      env: {
        ...process.env,
        DATABASE_URL: generateDatabaseURL(newId),
      },
    });
    return;
  }

  execSync(
    `psql ${getDatabaseUrlWithoutParams(
      sourceUrl
    )} -c 'CREATE DATABASE "${newId}" WITH TEMPLATE "${baseId}";'`
  );
});

// Delete each new testing database right after running a test
afterEach(async () => {
  if (!IS_DEV_ENVIRONMENT) {
    // Temporary fix for: https://d.pr/i/A052yv
    await prisma.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname in ('${process.env.DB_NAME}', 'test')
      AND pid <> pg_backend_pid()
      AND state in ('idle');
    `);
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${newId}" CASCADE;`);
    return;
  }

  await prisma.$disconnect();
  // Terminate active connections before dropping cloned database:
  await defaultPrisma.$executeRawUnsafe(
    `SELECT pg_terminate_backend(pg_stat_activity.pid) 
     FROM pg_stat_activity 
     WHERE pg_stat_activity.datname = '${newId}' 
     AND pid <> pg_backend_pid();`
  );
  // Drop cloned database:
  await defaultPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${newId}";`);
});

// Delete base database:
afterAll(async () => {
  if (!IS_DEV_ENVIRONMENT) return;
  await defaultPrisma.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${baseId}";`);
  await defaultPrisma.$disconnect();
});
