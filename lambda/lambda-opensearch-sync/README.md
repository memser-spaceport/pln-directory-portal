# AWS Lambda - OpenSearch sync

The Unified Search on the main page uses OpenSearch, the database that allows user to run full-text search across all the PLN portal.  
To synchronize the information with the source of truth (PostgreSQL database data) we use lambda function that delivers the most recent data from PostgreSQL into AWS OpenSearch.

## Deployment

### Prepare zip archive
You can deploy the function manually to AWS by archiving it into zip file (ignoring unnecessary files):
```bash
zip -rFS lambda-opensearch-sync . -x "*.my-ide-folder/*" "*.env" ".env.*"
```

### Adding environment variables
We also use environment variables, that you can check in lambda service in AWS for the "lambda-opensearch-sync" lambda function,  
check the list of the environment variables in the ".env.example" file
