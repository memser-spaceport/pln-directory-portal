import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto-browserify';

@Injectable()
export class FileEncryptionService {
  private getScryptKey() {
    const salt = process.env.FILE_ENCRYPTION_SALT;
    const hash = crypto.createHash('sha256');

    hash.update(salt);

    // `hash.digest()` returns a Buffer by default when no encoding is given
    return hash.digest().slice(0, 32);
  }

  getEncryptedFile(file: Express.Multer.File) {
    // Create an initialization vector
    const iv = crypto.randomBytes(16);
    // Create a new cipher using the algorithm, key, and iv
    const cipher = crypto.createCipheriv(
      process.env.FILE_ENCRYPTION_ALGORITHM,
      this.getScryptKey(),
      iv
    );

    // Create the new (encrypted) buffer
    file.buffer = Buffer.concat([
      iv,
      cipher.update(file.buffer),
      cipher.final(),
    ]);

    return file;
  }

  getDecryptedFile(buffer: Buffer) {
    const iv = buffer.slice(0, 16);
    const chunk = buffer.slice(16);
    const decipher = crypto.createDecipheriv(
      process.env.FILE_ENCRYPTION_ALGORITHM,
      this.getScryptKey(),
      iv
    );
    return Buffer.concat([decipher.update(chunk), decipher.final()]);
  }
}
