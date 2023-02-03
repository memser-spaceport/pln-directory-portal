import { Injectable } from '@nestjs/common';
import { IAirtableImage } from '@protocol-labs-network/airtable';
import * as fs from 'fs';
import * as client from 'https';
import * as path from 'path';
import sharp from 'sharp';
import { ImagesController } from '../../images/images.controller';
import {
  FILE_UPLOAD_SIZE_LIMIT,
  IMAGE_UPLOAD_MAX_DIMENSION,
} from '../constants';
@Injectable()
export class FileMigrationService {
  constructor(private readonly imagesController: ImagesController) {}
  async migrateFile(airtableImage: IAirtableImage) {
    const { url, size, type, filename, width, height } = airtableImage;
    if (
      type !== 'image/jpeg' &&
      type !== 'image/png' &&
      type !== 'image/webp'
    ) {
      return { status: 'File type not supported' };
    }
    if (width < 1 && height < 1) {
      return { status: 'File is not an image' };
    }
    try {
      await this.download(url, filename);
    } catch (error) {
      throw new Error(`Failed downloading the image - ${error}`);
    }
    const originalFilePath = `./${filename}`;
    const buffer = fs.readFileSync(originalFilePath);

    const compressedFileName = `${path.parse(filename).name}.webp`;
    let compressedFile;

    if (
      width > IMAGE_UPLOAD_MAX_DIMENSION ||
      height > IMAGE_UPLOAD_MAX_DIMENSION
    ) {
      compressedFile = await sharp(buffer)
        .toFormat('webp')
        .resize(IMAGE_UPLOAD_MAX_DIMENSION, IMAGE_UPLOAD_MAX_DIMENSION, {
          fit: 'inside',
        })
        .toFile(path.join('./', compressedFileName));
    } else {
      compressedFile = await sharp(buffer)
        .toFormat('webp')
        .toFile(path.join('./', compressedFileName));
    }

    if (compressedFile.size > FILE_UPLOAD_SIZE_LIMIT) {
      compressedFile = await sharp(fs.readFileSync(`./${compressedFileName}`))
        .webp({ quality: 50 })
        .toFile(path.join('./', compressedFileName));
    }

    const filePath = `./${compressedFileName}`;

    const newFile: Express.Multer.File = {
      path: filePath,
      size: size,
      filename: compressedFileName,
      buffer: fs.readFileSync(filePath),
      destination: '',
      fieldname: 'file',
      mimetype: `image/${compressedFile.format}`,
      originalname: compressedFileName,
      stream: fs.createReadStream(filePath),
      encoding: '7bit',
    };
    let image;
    try {
      const data = await this.imagesController.uploadImage(newFile);
      image = data.image;
    } catch (error) {
      throw new Error(`Failed uploading the image - ${error}`);
    }
    if (image) {
      fs.unlink(filePath, function (err) {
        if (err) throw err;
      });
      if (originalFilePath !== filePath) {
        fs.unlink(originalFilePath, function (err) {
          if (err) throw err;
        });
      }
    }
    return image;
  }
  download(url, filepath) {
    return new Promise((resolve, reject) => {
      client.get(
        url,
        {
          headers: {
            'accept-encoding': 'gzip, deflate, br',
          },
        },
        (res) => {
          if (res.statusCode === 200) {
            console.log('Downloading file...');
            res
              .pipe(fs.createWriteStream(filepath))
              .on('error', reject)
              .once('close', () => resolve(filepath));
          } else {
            // Consume response data to free up memory
            res.resume();
            reject(
              new Error(`Request Failed With a Status Code: ${res.statusCode}`)
            );
          }
        }
      );
    });
  }
}
