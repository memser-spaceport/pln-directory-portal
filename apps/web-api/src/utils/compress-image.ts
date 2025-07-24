import * as fs from 'fs';
import * as path from 'path';
// import sharp from 'sharp';
import {
  FILE_UPLOAD_SIZE_LIMIT,
  IMAGE_UPLOAD_MAX_DIMENSION,
} from './constants';

// Commented out sharp-related code for debugging
// export async function compressImage({ buffer, sharpImage, fileName, dir }) {
//   let compressedFile;
//   if (
//     sharpImage.width > IMAGE_UPLOAD_MAX_DIMENSION ||
//     sharpImage.height > IMAGE_UPLOAD_MAX_DIMENSION
//   ) {
//     compressedFile = await sharp(buffer)
//       .resize(IMAGE_UPLOAD_MAX_DIMENSION, IMAGE_UPLOAD_MAX_DIMENSION, {
//         fit: 'inside',
//         withoutEnlargement: true,
//       })
//       .toBuffer();
//   } else {
//     compressedFile = await sharp(buffer).toBuffer();
//   }
//   if (fileName && dir) {
//     compressedFile = await sharp(fs.readFileSync(`${dir}/${fileName}`))
//       .resize(IMAGE_UPLOAD_MAX_DIMENSION, IMAGE_UPLOAD_MAX_DIMENSION, {
//         fit: 'inside',
//         withoutEnlargement: true,
//       })
//       .toBuffer();
//   }
//   return compressedFile;
// }

export async function compressImage({ buffer, fileName, dir }: { buffer: Buffer, fileName: string, dir: string }) {
  // Return a dummy object with expected properties
  return { size: 0, format: 'webp' };
}
