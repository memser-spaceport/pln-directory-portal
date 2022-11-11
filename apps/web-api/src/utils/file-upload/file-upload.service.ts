import { Injectable } from '@nestjs/common';
import { File, Web3Storage } from 'web3.storage';

// Explicitly import multer to temporarily fix this issue:
// https://github.com/DefinitelyTyped/DefinitelyTyped/issues/47780
import 'multer';

@Injectable()
export class FileUploadService {
  private makeStorageClient() {
    return new Web3Storage({
      token: process.env.WEB3_STORAGE_API_TOKEN || '',
      endpoint: new URL('https://api.web3.storage'),
    });
  }

  private makeFileObjects(files: Array<Express.Multer.File>) {
    return files.map((file) => new File([file.buffer], `${file.originalname}`));
  }

  async storeFiles(uploadedFiles: Array<Express.Multer.File>) {
    const client = this.makeStorageClient();
    const fileObjects = this.makeFileObjects(uploadedFiles);
    const cid = await client.put(fileObjects);
    return cid;
  }

  async getFileUrl(cid: string, filename: string) {
    // Construct the actual file URL located at a public gateway:
    // https://web3.storage/docs/how-tos/retrieve/#using-an-ipfs-http-gateway
    const fileURL = `https://${cid}.ipfs.w3s.link/${filename}`;
    return fileURL;
  }
}
