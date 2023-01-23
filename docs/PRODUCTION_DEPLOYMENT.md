# Production Deployment

## Process

- The Production Deployment\_ workflow can be triggered ad-hoc by either running the workflow:
  - directly from the repository's _Actions_ panel
  - using the _npm_ script `yarn run deploy:production`
- After running the workflow, the web application will be deployed to [Vercel's Production Environment](https://plnetwork.io/) and the API to [Heroku's Production Environment](https://api.plnetwork.io/)

## Workflow

```mermaid
flowchart TD
    B{Is the 'staging' branch\nahead of the 'main' branch?}
    A[Production Deployment\nworkflow gets called] --> B
    B -->|Yes| C[Rebase the 'staging' branch\nonto the 'main' branch]
    B -->|No| G(Done)
    C --> D[Create a new release version]
    D --> E[Build the app on Vercel\nand deploy it to the Production Environment]
    D --> F[Build the API on Heroku\nand deploy it to the Production Environment]
    E --> G
    F --> G
```
