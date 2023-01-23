# Staging Deployment

## Process

- The _Staging Deployment_ workflow:
  - runs every day at 8 AM
  - can be triggered ad-hoc by either running the workflow:
    - directly from the repository's _Actions_ panel
    - using the _npm_ script `yarn run deploy:staging`
- After running the workflow, the web application will be deployed to [Vercel's Staging Environment](https://staging.plnetwork.io/) and the API to [Heroku's Staging Environment](https://stag-protocol-labs-network-api.herokuapp.com/)

## Workflow

```mermaid
flowchart TD
    C{Is the 'develop' branch\nahead of the 'staging' branch?}
    A[Staging Deployment workflow\nruns every day at 8 AM] --> C
    B[Staging Deployment workflow\ngets called ad-hoc] --> C
    C -->|Yes| D[Rebase the 'develop' branch\nonto the 'staging' branch]
    C -->|No| H(Done)
    D --> E[Create a new pre-release version]
    E --> F[Build the app on Vercel\nand deploy it to the Staging Environment]
    E --> G[Build the API on Heroku\nand deploy it to the Staging Environment]
    F --> H
    G --> H
```
