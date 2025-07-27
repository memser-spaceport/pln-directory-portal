import { Injectable } from '@nestjs/common';
import { IAirtableImage } from '@protocol-labs-network/airtable';
import * as fs from 'fs';
import * as client from 'https';
import * as path from 'path';
import { ImagesController } from '../../images/images.controller';
import { hashFileName } from '../hashing';
@Injectable()
export class FileMigrationService {
  constructor(private readonly imagesController: ImagesController) {}
  async migrateFile(airtableImage: IAirtableImage) {
    const { id, url, size, type, filename, width, height } = airtableImage;
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
    // Remove all sharp, compression, and .webp conversion logic
    // Only download and upload the original file
    const filePath = `./${filename}`;
    const newFile: Express.Multer.File = {
      path: filePath,
      size: size,
      filename: filename,
      buffer: fs.readFileSync(filePath),
      destination: '',
      fieldname: 'file',
      mimetype: type,
      originalname: filename,
      stream: fs.createReadStream(filePath),
      encoding: '7bit',
    };
    let image;
    try {
      const data = await this.imagesController.uploadImage(newFile, {
        needsToHashFilename: false,
      });
      image = data.image;
    } catch (error) {
      throw new Error(`Failed uploading the image - ${error}`);
    }
    if (image) {
      fs.unlink(filePath, function (err) {
        if (err) throw err;
      });
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
