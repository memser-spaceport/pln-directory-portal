import { Image, ImageSize } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createImage({ amount }: TestFactorySeederParams) {
  const imageFactory = Factory.define<Omit<Image, 'id'>>(({ sequence }) => {
    const image = {
      uid: `uid-${sequence}`,
      cid: 'cid',
      width: 33,
      height: 33,
      url: 'url',
      filename: '',
      size: 33,
      type: 'WEBP',
      version: ImageSize.ORIGINAL,
      thumbnailToUid: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return image;
  });

  const images = await imageFactory.buildList(amount);
  await prisma.image.createMany({
    data: images,
  });
}
