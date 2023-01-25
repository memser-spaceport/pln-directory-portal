import { Injectable } from '@nestjs/common';
import { IAirtableImage } from '@protocol-labs-network/airtable';
import * as fs from 'fs';
import * as client from 'https';
import { ImagesController } from '../../images/images.controller';
import { FILE_UPLOAD_SIZE_LIMIT } from '../constants';

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

    // TODO: Remove this condition after applying compression
    if (size > FILE_UPLOAD_SIZE_LIMIT) {
      return { status: 'File size too large' };
    }

    if (width < 1 && height < 1) {
      return { status: 'File is not an image' };
    }

    try {
      await this.download(url, filename);
    } catch (error) {
      throw new Error(`Failed downloading the image - ${error}`);
    }

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
      // TODO: Apply image compression
      const data = await this.imagesController.uploadImage(newFile);
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
