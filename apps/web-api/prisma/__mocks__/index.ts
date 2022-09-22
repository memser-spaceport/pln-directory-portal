import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { join } from 'path';
import { URL } from 'url';
import { v4 } from 'uuid';

// Retrieves the full database URL with the provided schema name
const generateDatabaseURL = (schema: string) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('please provide a database url');
  }
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.append('schema', schema);
  return url.toString();
};

//  Build a new database URL from a randomly generated schema name:
const schemaId = `test-${v4()}`;
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
const url = generateDatabaseURL(schemaId);
// Reassign the default database URL environment variable from the newly generated URL:
process.env.DATABASE_URL = url;

// Build a new ORM instance from the newly generated URL:
export const prisma = new PrismaClient({
  datasources: { db: { url } },
});

// Create a new & isolated database right before running each test
beforeEach(() => {
  execSync(`${prismaBinary} db push --schema=${schemaPath}`, {
    env: {
      ...process.env,
      DATABASE_URL: generateDatabaseURL(schemaId),
    },
  });
});

// Delete each new testing database right after running a test
afterEach(async () => {
  await prisma.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${schemaId}" CASCADE;`
  );
  await prisma.$disconnect();
});
