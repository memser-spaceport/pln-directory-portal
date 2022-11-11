import { faker } from '@faker-js/faker';
import { Image } from '@prisma/client';
import { Factory } from 'fishery';

/**
 * TODO: Enhance this factory to more seamlessly handle the the generate of all images
 * with several thumbnails for each image
 */
const originalImagesFactory = Factory.define<Image>(({ sequence }) => {
  return {
    id: sequence,
    uid: `uid-${sequence}`,
    url: faker.image.animals(),
    cid: `cid-${sequence}`,
    filename: `filename-${sequence}`,
    height: faker.datatype.number(300),
    width: faker.datatype.number(300),
    size: faker.datatype.number(1000),
    type: 'PNG',
    thumbnailToUid: null,
    version: 'ORIGINAL',
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  };
});

export const originalImages = originalImagesFactory.buildList(100);

// Set the first 50 images to have a thumbnailToUid
export const imageRelations = async (images) => {
  const thumbnailImages = images.filter((image) => image.id < 50);

  return thumbnailImages.map((image) => ({
    where: {
      id: image.id,
    },
    data: {
      thumbnailToUid: `uid-${image.id + 49}`,
    },
  }));
};
