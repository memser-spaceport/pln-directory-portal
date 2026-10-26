import { Injectable } from '@nestjs/common';
import { createCipheriv, hkdfSync, randomBytes } from 'crypto';

// Must match the Cloudflare worker (cloudflare/workers/web3-file-retrieval),
// which decrypts these files.
export const FILE_ENCRYPTION_CIPHER = 'aes-256-ctr';
export const FILE_ENCRYPTION_MARKER = Buffer.from('PLNENC02', 'ascii');
export const FILE_ENCRYPTION_HKDF_INFO = 'pln-file-encryption-v2';

@Injectable()
export class FileEncryptionService {
  private getDerivedKey() {
    const password = process.env.FILE_ENCRYPTION_PASSWORD;
    const salt = process.env.FILE_ENCRYPTION_SALT;

    if (!password || !salt) {
      throw new Error('FILE_ENCRYPTION_PASSWORD and FILE_ENCRYPTION_SALT must be set to encrypt files');
    }

    return Buffer.from(hkdfSync('sha256', password, salt, FILE_ENCRYPTION_HKDF_INFO, 32));
  }

  // Output layout: marker (8) || iv (16) || ciphertext
  getEncryptedFile(file: Express.Multer.File) {
    const key = this.getDerivedKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(FILE_ENCRYPTION_CIPHER, key, iv);

    file.buffer = Buffer.concat([FILE_ENCRYPTION_MARKER, iv, cipher.update(file.buffer), cipher.final()]);

    return file;
  }
}
