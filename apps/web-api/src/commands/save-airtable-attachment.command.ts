import {
  IAirtableMember,
  IAirtableTeam,
} from '@protocol-labs-network/airtable';
import * as fs from 'fs';
import * as client from 'https';
import { Command, CommandRunner } from 'nest-commander';
import { AirtableService } from '../utils/airtable/airtable.service';

@Command({
  name: 'save-airtable-attachment',
  description: 'A command to save data from Airtable into a json file',
})
export class SaveAirtableDataCommand extends CommandRunner {
  private teams: IAirtableTeam[];
  private members: IAirtableMember[];

  constructor(private readonly airtableService: AirtableService) {
    super();
  }

  async run(): Promise<void> {
    console.log('Hello World');
  }

  private async insertTeamAttachment() {
    this.teams = await this.airtableService.getAllTeams();

    // Write JSON string to a file
    for (const team of this.teams) {
      if (team.fields.Logo) {
        const logo = team.fields.Logo[0];
        // const image = {
        //   id: logo.id ? logo.id : '',
        //   url: logo.url ? logo.url : '',
        //   filename: logo.filename ? logo.filename : '',
        //   size: logo.size ? logo.size : 0,
        //   type: logo.type ? logo.type : '',
        //   height: logo.height ? logo.height : 0,
        //   width: logo.width ? logo.width : 0,
        // };
        const { filename, size, type, url } = logo;
        await this.downloadFile(url, filename);

        const filePath = `./${filename}`;
        const newFile: Express.Multer.File = {
          path: filePath,
          size: size!,
          filename: filename!,
          buffer: fs.readFileSync(filePath),
          destination: '',
          fieldname: 'file',
          mimetype: type!,
          originalname: filename!,
          stream: fs.createReadStream(filePath),
          encoding: '7bit',
        };
        let image;
        try {
        } catch (error) {
          throw new Error(`Failed uploading the image - ${error}`);
        }
      }
    }
  }

  private async downloadFile(url, filepath) {
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
