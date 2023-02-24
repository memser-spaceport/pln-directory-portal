# 📤 Airtable Data Migration

The PLN Directory data needed to be migrated from Airtable into our own relational database.

### Why?

- Lack of advanced data validation on Airtable that was easily leading to integrity issues;

- Being faced with limitations and constraints imposed by the Airtable API;

- In need of more control over the data schema;

- To support the PLN Directory future needs:
  - In-app authentication system (supporting web3)
  - Role-based access control

### Requirements

- Decoupling the existing Airtable data to match our new data schema;

- [Convert the existing location](./LOCATION_MAPPING.md) fields on Airtable (city, country, state/province, region) into existing Google Places API results before inserting them on our database;

- Applying file encryption to the images being migrated from Airtable into Web3Storage;

### How? Building a CLI command

We've built a CLI command: [`MigrateAirtableDataCommand`](../apps/web-api/src/commands/migrate-airtable-data.command.ts) using the [Nest Commander](https://github.com/jmcdo29/nest-commander) library.

The command is mainly responsible for:

1. Calling the [`AirtableService`](../apps/web-api/src/utils/airtable/airtable.service.ts) that fetches data from the Airtable API;
2. Validating the incoming data schema from the Airtable API;
3. Calling the corresponding entity services (e.g. [`IndustryTagsService`](../apps/web-api/src/industry-tags/industry-tags.service.ts#L24)) that we'll update or create the incoming data into our database;

For the purpose of converting the locations coming from Airtable into matching Google Places API results we made use of a service called [`LocationTransferService`](../apps/web-api/src/utils/location-transfer/location-transfer.service.ts) responsible for finding and retrieving a Google Places API result from an Airtable member.

As for the images being migrated, we've made use of another service called [`FileMigrationService`](../apps/web-api/src/utils/file-migration/file-migration.service.ts) that's responsible for downloading images and calling the existing [`uploadImage`](../apps/web-api/src/images/images.controller.ts#L61) method that takes care of compressing files, generating thumbnails and finally encrypting those images before uploading them to Web3Storage and inserting them on the database.

### Running the command

Commands that run in production, are first [built into a bundle](../apps/web-api/project.json#L29) on the [Heroku post build command](../package.json#L15).

Running it in production:

```console
yarn api:prod-migrate-airtable-data
```

Running it locally (for development purposes only):

```console
yarn api:migrate-airtable-data
```
