import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import {
  FILE_UPLOAD_SIZE_LIMIT,
  IMAGE_UPLOAD_MAX_DIMENSION,
} from './constants';

export async function compressImage({ buffer, sharpImage, fileName, dir }) {
  let compressedFile;
  if (
    sharpImage.width > IMAGE_UPLOAD_MAX_DIMENSION ||
    sharpImage.height > IMAGE_UPLOAD_MAX_DIMENSION
  ) {
    compressedFile = await sharp(buffer)
      .toFormat('webp')
      .resize(IMAGE_UPLOAD_MAX_DIMENSION, IMAGE_UPLOAD_MAX_DIMENSION, {
        fit: 'inside',
      })
      .toFile(path.join(dir, fileName));
  } else {
    compressedFile = await sharp(buffer)
      .toFormat('webp')
      .toFile(path.join(dir, fileName));
  }

  // If the file is still too big, compress it more
  if (compressedFile.size > FILE_UPLOAD_SIZE_LIMIT) {
    compressedFile = await sharp(fs.readFileSync(`${dir}/${fileName}`))
      .webp({ quality: 50 })
      .toFile(path.join(dir, fileName));
  }

  return compressedFile;
}
