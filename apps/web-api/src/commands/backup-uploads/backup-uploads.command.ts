import fs from 'fs';
import archiver from 'archiver';
import { Storage as GoogleStorage } from '@google-cloud/storage';
import { Command, CommandRunner } from 'nest-commander';
import { Web3Storage } from 'web3.storage';
import { FileEncryptionService } from '../../utils/file-encryption/file-encryption.service';

@Command({
  name: 'backup-uploads',
  description:
    'A command to backup every uploaded file on Web3Storage into GCP.',
})
export class BackupUploadsCommand extends CommandRunner {
  private client: Web3Storage;
  private storage: GoogleStorage;
  private manifest: string[];

  constructor(private readonly fileEncryptionService: FileEncryptionService) {
    super();

    if (!process.env.WEB3_STORAGE_API_TOKEN) {
      throw new Error('Missing WEB3_STORAGE_API_TOKEN');
    }

    this.client = new Web3Storage({
      token: process.env.WEB3_STORAGE_API_TOKEN,
    });

    this.storage = new GoogleStorage();

    // Holds the current CIDs stored on the temporary folder:
    this.manifest = this.setupTemporaryFolderWithManifest();
  }

  /**
   * Extracts the links from an IPFS HTTP gateway.
   * https://web3.storage/docs/how-tos/retrieve/#using-an-ipfs-http-gateway
   *
   * FYI: Unfortunately this wasn't achievable through the client library.
   */
  private async getLinks(cid) {
    try {
      return await fetch(`https://${cid}.ipfs.w3s.link`).then(async (data) =>
        Array.from(
          await (
            await data.text()
          ).matchAll(
            /\/ipfs\/[a-zA-Z0-9]{50,}\/(?<filename>[a-z0-9_.@()%-]+\.[jpg|jpeg|png|webp|pdf|csv]+)/gm
          ),
          (m) => [m[1], `https://${cid}.ipfs.w3s.link/${m[1]}`]
        )
      );
    } catch (error) {
      throw new Error(`Failed to fetch link:\n https://${cid}.ipfs.w3s.link`);
    }
  }

  /**
   * Adds a temporary folder to store all
   * files uploaded on Web3Storage.
   *
   * Also adds a manifest file to make this
   * command resumable in case it needs to be run in batches.
   */
  private setupTemporaryFolderWithManifest() {
    if (!fs.existsSync('tmp')) {
      fs.mkdirSync('tmp');
    }

    if (!fs.existsSync('tmp/manifest.json')) {
      fs.writeFileSync('tmp/manifest.json', '[]');
    }

    return JSON.parse((fs as any).readFileSync('tmp/manifest.json'));
  }

  private addCIDtoManifest(cid: string) {
    this.manifest.push(cid);
    fs.writeFileSync('tmp/manifest.json', JSON.stringify(this.manifest));
  }

  async zipTemporaryFolder(filename: string) {
    const output = fs.createWriteStream(`tmp/${filename}.zip`);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Sets the compression level.
    });
    archive.directory('tmp', filename);
    await archive.pipe(output);
    await archive.finalize();
  }

  private async storeBackupOnGCP(filename: string) {
    // TODO: Replace hardcoded value with environment variable
    const bucketName = 'pln-uploads-backups';

    // TODO: Add missing authentication
    // https://cloud.google.com/storage/docs/authentication#libauth
    await this.storage.bucket(bucketName).upload(`tmp/${filename}.zip`, {
      destination: filename,
      resumable: true,
    });
    console.log(`${filename} uploaded to ${bucketName}`);
  }

  private async downloadFilesFromLinks(links: string[][]) {
    try {
      return await Promise.all(
        links.map(
          async ([filename, link]) =>
            await fetch(link).then(async (data) => ({
              filename,
              buffer: Buffer.from(await data.arrayBuffer()),
            }))
        )
      );
    } catch (error) {
      throw new Error(
        `There was an issue while downloading a file:\n ${error}`
      );
    }
  }

  private decryptFiles(
    filesEncrypted: Array<{ filename: string; buffer: Buffer }>
  ) {
    return filesEncrypted.map(({ filename, buffer }) => ({
      filename,
      buffer: this.fileEncryptionService.getDecryptedFile(buffer),
    }));
  }

  private storeFilesOnTemporaryFolder(
    files: Array<{ filename: string; buffer: Buffer }>
  ) {
    for (const file of files) {
      fs.writeFileSync(`tmp/${file.filename}`, file.buffer);
    }
  }

  async run(): Promise<void> {
    // Go through each upload:
    // https://web3.storage/docs/how-tos/list/#listing-your-uploads
    for await (const upload of this.client.list()) {
      console.log(
        `${upload.name} - cid: ${upload.cid} - size: ${upload.dagSize}`
      );

      // Skip CID content if already registered on the manifest file
      if (this.manifest.includes(upload.cid)) {
        continue;
      }

      const links = await this.getLinks(upload.cid);
      const filesEncrypted = await this.downloadFilesFromLinks(links);
      const filesToBackup = this.decryptFiles(filesEncrypted);

      // Store files on the temporary folder
      this.storeFilesOnTemporaryFolder(filesToBackup);

      // Add CID to manifest file
      this.addCIDtoManifest(upload.cid);
    }

    // Build a timestamped filename to avoid collisions:
    const backupFilename = `uploads-${Date.now()}`;
    await this.zipTemporaryFolder(backupFilename);
    await this.storeBackupOnGCP(backupFilename);
  }
}
