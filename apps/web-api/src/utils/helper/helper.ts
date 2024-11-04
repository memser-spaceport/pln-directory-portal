import crypto from 'crypto';

export const getRandomId = () => {
  return crypto.randomUUID({ disableEntropyCache: true });
};

export const generateOAuth2State = () => {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
};

export const generateProfileURL = (value, type='uid') => {
  let profileURL;
  if (type === 'uid') {
    profileURL = `${process.env.WEB_UI_BASE_URL}/members/${value}`
  }
  return profileURL;
}

export const isEmails = (emails: string[]) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let isValid = true;
  for (const email of emails) {
    if (!re.test(email)) {
      isValid = false;
    }
  }
  return isValid;
}

export const slugify = (name: string) => {
  return name.toLowerCase()                   // Convert the name to lowercase
    .replace(/\s+/g, '-')            // Replace spaces with hyphens
    .replace(/[^\w-]+/g, '')         // Remove non-word characters
    .replace(/--+/g, '-')            // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '')              // Trim hyphens from start of string
    .replace(/-+$/, '');             // Trim hyphens from end of string
}

/**
   * Copies specific fields from the source JSON to the destination object
   * @param srcJson - Source JSON
   * @param destJson - Destination object
   * @param directFields - List of fields to copy
   */
export const copyObj = (srcJson: any, destJson: any, directFields: string[]) => {
  directFields.forEach(field => {
    destJson[field] = srcJson[field];
  });
}

/**
 * Utility function to map single relational data
 * 
 * @param field - The field name to map
 * @param rawData - The raw data input
 * @returns - Relation object for Prisma query
 */
export const buildRelationMapping = (field: string, rawData: any) => {
  return rawData[field]?.uid
    ? { connect: { uid: rawData[field].uid } }
    : undefined;
}

/**
 * Utility function to map multiple relational data
 * 
 * @param field - The field name to map
 * @param rawData - The raw data input
 * @param type - Operation type ('create' or 'update')
 * @returns - Multi-relation object for Prisma query
 */
export const buildMultiRelationMapping = (field: string, rawData: any, type: string) => {
  const dataExists = rawData[field]?.length > 0;
  if (!dataExists) {
    return type === 'Update' ? { set: [] } : undefined;
  }
  return {
    [type === 'Create' ? 'connect' : 'set']: rawData[field].map((item: any) => ({ uid: item.uid }))
  };
}