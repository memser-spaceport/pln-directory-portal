## Backup File Uploads

### Strategy:

- Use a [CLI command](./backup-uploads.command.ts) to backup files
- Run the CLI command daily on a [Heroku background job](https://devcenter.heroku.com/articles/background-jobs-queueing)
- Store the backups on Google Cloud Storage

⚠️ As of now, the CLI command won't work until we have configured the Googe Cloud Storage client authentication as listed on the to-dos section below.

### To-dos:

- [x] Build the CLI Command
  - [ ] Unit Tests
- [ ] Configure Google Cloud Storage client authentication
- [ ] Setup a worker dyno on Heroku
- [ ] Setup a daily cron job
