import { createAgent } from '@forestadmin/agent';
import { createSqlDataSource } from '@forestadmin/datasource-sql';
import axios from 'axios';
import { Readable } from 'stream';
import { ImagesController } from '../../images/images.controller';
import { ImagesService } from '../../images/images.service';
import { PrismaService } from '../../prisma.service';
import { FileEncryptionService } from '../file-encryption/file-encryption.service';
import { FileUploadService } from '../file-upload/file-upload.service';
import { generateUid } from './generated-uid';

async function executeImageUpload(context) {
  const file = context.formValues.Image;
  const builtFile: Express.Multer.File = {
    fieldname: 'field name',
    originalname: file.name,
    encoding: file.mimetype,
    mimetype: file.mimetype,
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
    new FileUploadService(new FileEncryptionService())
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

  collection.addHook('After', 'Create', async () => {
    await triggerSync('member-to-pln-airtable');
  });

  collection.addHook('After', 'Update', async () => {
    await triggerSync('member-to-pln-airtable');
  });

  collection.addHook('After', 'Delete', async () => {
    await triggerSync('member-to-pln-airtable');
  });
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

  collection.addHook('After', 'Create', async () => {
    await triggerSync('team-to-pln-airtable');
  });

  collection.addHook('After', 'Update', async () => {
    await triggerSync('team-to-pln-airtable');
  });

  collection.addHook('After', 'Delete', async () => {
    await triggerSync('team-to-pln-airtable');
  });
});

agent.customizeCollection('IndustryTag', (collection) => {
  collection.addHook('After', 'Create', async () => {
    await triggerSync('industry-tag-to-pln-airtable');
  });

  collection.addHook('After', 'Update', async () => {
    await triggerSync('industry-tag-to-pln-airtable');
  });

  collection.addHook('After', 'Delete', async () => {
    await triggerSync('industry-tag-to-pln-airtable');
  });
});

async function triggerSync(slug) {
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
    throw new error(error);
  }
}

agent.use(generateUid);

export default agent;
