import { createAgent } from '@forestadmin/agent';
import { createSqlDataSource } from '@forestadmin/datasource-sql';
import * as Sentry from '@sentry/minimal';
import axios from 'axios';
import { Readable } from 'stream';
import { ImagesController } from '../../images/images.controller';
import { ImagesService } from '../../images/images.service';
import { PrismaService } from '../../shared/prisma.service';
import { APP_ENV } from '../constants';
import { FileEncryptionService } from '../file-encryption/file-encryption.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { AwsService } from '../aws/aws.service';
import { LocationTransferService } from '../location-transfer/location-transfer.service';
import { generateUid } from './generated-uid';
import { resetCacheAfterCreateOrUpdateOrDelete } from './reset-cache-after-cud';

const prismaService = new PrismaService();

async function executeImageUpload(context) {
  const file = context.formValues.Image;

  const builtFile: Express.Multer.File = {
    fieldname: 'field name',
    originalname: file.name,
    encoding: file.mimeType,
    mimetype: file.mimeType,
    buffer: file.buffer,
    size: Buffer.byteLength(file.buffer),
    destination: '.',
    filename: file.name,
    path: file.name,
    stream: Readable.from(file.buffer),
  };
  const prismaService = new PrismaService();
  const uploadController = new ImagesController(
    new ImagesService(prismaService),
    new FileUploadService(new FileEncryptionService(), new AwsService())
  );
  const { image } = await uploadController.uploadImage(builtFile);
  prismaService.$disconnect();

  return image;
}

const agent = createAgent({
  authSecret: process.env.FOREST_AUTH_SECRET || '',
  envSecret: process.env.FOREST_ENV_SECRET || '',
  isProduction: process.env.ENVIRONMENT === 'production',
}).addDataSource(createSqlDataSource(process.env.DATABASE_URL || ''));

agent.customizeCollection('Member', (collection) => {
  // TODO: Check if we can do all of this on the member creation
  collection.addAction('Upload image', {
    scope: 'Single',
    form: [
      {
        label: 'Image',
        type: 'File',
      },
    ],
    execute: async (context, resultBuilder) => {
      const image = await executeImageUpload(context);
      const memberId = await context.getRecordId();
      context.collection.update(
        {
          conditionTree: {
            field: 'id',
            operator: 'Equal',
            value: memberId,
          },
        },
        { imageUid: image.uid }
      );
    },
  });

  configureCUDSyncs(collection, 'member-to-pln-airtable');
});

agent.customizeCollection('Team', (collection) => {
  collection.addAction('Upload image', {
    scope: 'Single',
    form: [
      {
        label: 'Image',
        type: 'File',
      },
    ],
    execute: async (context, resultBuilder) => {
      const image = await executeImageUpload(context);
      const teamId = await context.getRecordId();
      context.collection.update(
        {
          conditionTree: {
            field: 'id',
            operator: 'Equal',
            value: teamId,
          },
        },
        { logoUid: image.uid }
      );
    },
  });

  configureCUDSyncs(collection, 'team-to-pln-airtable');
});

agent.customizeCollection('IndustryTag', (collection) => {
  configureCUDSyncs(collection, 'industry-tag-to-pln-airtable');
});

agent.customizeCollection('TeamMemberRole', (collection) => {
  configureCUDSyncs(collection, 'member-to-pln-airtable');
});

agent.customizeCollection('_MemberToSkill', (collection) => {
  configureCUDSyncs(collection, 'member-to-pln-airtable');
});

agent.customizeCollection('_IndustryTagToTeam', (collection) => {
  configureCUDSyncs(collection, 'team-to-pln-airtable');
});

agent.customizeCollection('_MembershipSourceToTeam', (collection) => {
  configureCUDSyncs(collection, 'team-to-pln-airtable');
});

agent.customizeCollection('_TeamToTechnology', (collection) => {
  configureCUDSyncs(collection, 'team-to-pln-airtable');
});

agent.customizeCollection('Location', (collection) => {
  collection.addField('formattedLocation', {
    columnType: 'String',
    dependencies: ['city', 'country', 'region', 'continent', 'metroArea'],
    getValues: (records) =>
      records.map(
        (r) =>
          `${r.city ? r.city + ' - ' : ''}${
            r.metroArea ? r.metroArea + ' - ' : ''
          }${r.region ? r.region + ' : ' : ''}${r.country} (${r.continent})`
      ),
  });

  collection.addHook('Before', 'Create', async (context) => {
    const { city, country, continent, region, metroArea } = context.data[0];
    await generateGoogleApiData(
      city,
      country,
      continent,
      region,
      metroArea,
      context
    );
  });

  collection.addHook('Before', 'Update', async (context) => {
    let { city, country, continent, region, metroArea } = context.patch;

    if (!city || !country) {
      const location = await prismaService.location.findUnique({
        where: {
          id: context.patch['id'],
        },
      });

      if (!location) {
        context.throwForbiddenError('Location not found');
        return;
      }

      city = city === null ? '' : city || location.city;
      metroArea = metroArea === null ? '' : metroArea || location.metroArea;
      country = country || location.country;
      continent = continent || location.continent;
      region = region === null ? '' : region || location.region;
    }

    await generateGoogleApiData(
      city,
      country,
      continent,
      region,
      metroArea,
      context
    );
  });
});

agent.use(resetCacheAfterCreateOrUpdateOrDelete);

async function generateGoogleApiData(
  city,
  country,
  continent,
  region,
  metroArea,
  context
) {
  const locationTransferService = new LocationTransferService(prismaService);
  const { location } = await locationTransferService.fetchLocation(
    city,
    country,
    continent,
    region,
    metroArea
  );

  if (!location) {
    context.throwForbiddenError('Provided location not valid');
    return;
  }

  if (!context.data && !context.patch) {
    context.throwForbiddenError('Provided information not valid');
    return;
  }

  const existingLocation = await prismaService.location.findUnique({
    where: {
      placeId: location.placeId,
    },
  });

  // Check if location already exists when creating a new location or when updating a location
  if (
    (existingLocation && context.data) ||
    (existingLocation &&
      context.patch &&
      existingLocation.id !== context.patch['id'])
  ) {
    context.throwForbiddenError('Provided location already exists');
    return;
  }

  const target = context.data ? context.data[0] : context.patch;
  Object.assign(target, location);
}

async function configureCUDSyncs(collection, slug) {
  collection.addHook('After', 'Create', async () => {
    await triggerSync(slug);
  });

  collection.addHook('After', 'Update', async () => {
    await triggerSync(slug);
  });

  collection.addHook('After', 'Delete', async () => {
    await triggerSync(slug);
  });
}

async function triggerSync(slug) {
  if (process.env.ENVIRONMENT !== APP_ENV.PRODUCTION) {
    return;
  }
  try {
    await axios.post(
      'https://api.hightouch.com/api/v1/syncs/trigger',
      {
        syncSlug: slug,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HIGHTOUCH_API_KEY}`,
        },
      }
    );
  } catch (error) {
    Sentry.captureException(`${error} - Sync trigger failed`);
    return;
  }
}

agent.use(generateUid);

export default agent;
