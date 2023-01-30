# Pull Request Guidelines

This document outlines the guidelines for submitting and reviewing pull requests in our codebase.

These guidelines are designed to ensure that our code is of high quality, easy to maintain, and follows our established conventions.

By following these guidelines, we can ensure that pull requests are reviewed and merged quickly and efficiently.

## Workflow

Our pull request workflow is designed to ensure that code changes are thoroughly reviewed and validated before they are merged into our production branch.

Here are a few key points to keep in mind:

1. Pull requests should be assigned to the author of the code changes;
2. When opening a pull request, label it with the appropriate status and type labels;
3. Within the description section, identify the changes, the corresponding JIRA tickets and check every item in the available checklist;
4. To be merged, the changes in the pull request must pass the following validation criteria:
   - Successfully lints the NX-specific workspace files;
   - Successfully checks the code format using Prettier;
   - Successfully lints the apps/libraries affected by the code changes;
   - Successfully tests the apps/libraries affected by the code changes;
   - Successfully deploys web application on Vercel;
   - Feature branch has been synchronized with the latest changes made on the `develop` branch;
   - Commit messages provide meaningful context and clearly describe the code changes;
   - Has at least one approval from a code owner.

All the above steps are mandatory and should be followed strictly to maintain the quality of the code and prevent any bugs or errors.

## Best Practices

- Always review, test and debug code changes before opening a pull request to ensure that the code is working as intended;
- Avoid large commits and always split them into smaller chunks if possible;
- Use the appropriate labels when opening pull requests;
- Follow the validation criteria strictly;
- Keep the number of open pull requests to a minimum to avoid merge conflicts.

By following these best practices, we can ensure that our code is of high quality and that our development process is efficient and streamlined.

## Code Review

While conducting code review, it is expectable that reviewers will:

- thoroughly review the code changes, paying attention to the readability and maintainability of the code;
- thoroughly review the code changes, ensuring that the code adheres to our established coding standards and guidelines;
- provide constructive feedback on the code changes, including suggestions for improvement and any identified issues;
- complete code review in a timely manner to avoid delays in the development process.

After being given code review feedback, the author shall address any feedback or concerns raised by reviewers before the code is merged.

It is important to remember that code review is a collaborative process and that the goal is to improve the quality of our codebase, not to assign blame or criticize the work of others. Be respectful, professional and always willing to help each other to improve our codebase.
