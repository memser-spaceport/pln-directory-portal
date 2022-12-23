import cuid from 'cuid';

/**
 * > This function will add a hook to the `Before` event of the `Create` action for each collection
 * that has a `uid` field
 */
export async function generateUid(dataSource, collection, options) {
  dataSource.collections.forEach((collection) => {
    if (collection.schema.fields['uid']) {
      collection.addHook('Before', 'Create', async (context) => {
        const generatedCuid = cuid();
        context._data[0]['uid'] = generatedCuid;
      });
    }
  });
}
