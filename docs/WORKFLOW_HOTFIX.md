# Hotfix Workflow

```mermaid
flowchart TD
  A[Checkout 'main' branch] --> B[Pull latest changes]
  B --> C[Checkout a new hotfix branch]
  C --> D[Commit changes to the hotfix branch]
  D --> E[Push the hotfix branch to the remote repository]
  E --> F[Open a pull request to merge the hotfix branch\nback into the 'main' branch]
  F --> G[Wait for peers' code review]
  G --> H{"Pull request validated?\n(check validation criteria)"}
  H --> |No| K[Address peers' code review feedback\nor fix failing criteria]
  K --> G
  H --> |Yes| I["Merge to 'main' branch using a rebase strategy"]
  I --> J(Done)
```
