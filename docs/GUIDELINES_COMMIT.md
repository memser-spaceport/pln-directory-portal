# Commit Guidelines

This document provides a guide to the commit guidelines for our project following the [Conventional Commits](https://www.conventionalcommits.org/) standard.

It includes details on commit message format, specification on types of commits, scopes, best practices for the description, body and footer, guidelines for commits containing breaking changes, and examples of valid commit messages.

By following these guidelines, we can ensure that our commits are consistent, clear, and easy to understand. This will also help us maintain a well-organized and efficient development process.

## Guidelines

Use [Conventional Commits](https://www.conventionalcommits.org/) formatting convention, so that the commit message structure follows this template:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Example:**

```
feat(PL-360): enforce commit guidelines
```

## Specification

### type

Commits must be prefixed with a type, which can be one of the following:

- `build` – changes that affect the build system or external dependencies;
- `chore` – changes that do not relate to a fix or feature and don't modify src or test files (for example updating dependencies);
- `ci` – continuous integration related;
- `docs` – updates to documentation such as a the README or other markdown files;
- `feat` – a new feature is introduced with the changes;
- `fix` – a bug fix has occurred;
- `perf` – performance improvements;
- `refactor` – refactored code that neither fixes a bug nor adds a feature;
- `revert` – reverts a previous commit;
- `style` – changes that do not affect the meaning of the code, likely related to code formatting such as white-space, missing semi-colons, and so on;
- `test` – including new or correcting previous tests.

### scope

When provided, the scope must follow the `PL-XYZ` format, where `XYZ` is a valid JIRA ticket number.

**Scope is mandatory** for the following types: `chore`, `feat`, `fix`, `perf`, `refactor`, `style` & `test`;

**Scope is optional** for the following types: `build`, `ci`, `docs` & `revert`.

### description

A short summary of the code changes.

Here are a few guidelines for writing a valid description:

- Always try to complete the sentence “_if applied, the code changes in this commit will…_ `description`”;
- Always use the imperative, present tense;
- Always assume no context and seek for consistency when writing a commit message.

### body _(optional)_

A body can also be provided after the description to provide additional contextual information about the code changes.

### footer(s) _(optional)_

Each footer must consist of a word token followed by a `: `.

A footer’s token must use `-` in place of whitespace characters (e.g., `Acked-by`), which helps differentiate the footer section from a multi-paragraph body. An exception is made for `BREAKING CHANGE`, which may also be used as a token.

Furthermore, a footer’s value can contain spaces and newlines, and parsing must terminate when the next valid footer token/separator pair is observed.

**Example:**

```
Reviewed-by: Z
```

## Breaking changes

### footer(s) _(optional)_

Using `BREAKING CHANGE` in the footer introduces a breaking API change.

If included, a breaking change must consist of the uppercase text `BREAKING CHANGE`, followed by a colon, a space, and description (e.g., `BREAKING CHANGE: environment variables now take precedence over config files`).

We can use `BREAKING-CHANGE` and `BREAKING CHANGE` interchangeably.

## Additional notes

The rule of thumb is to always aim to submit small and atomic commits.

If you find yourself struggling to write a clear, concise commit message, it’s possible that your commit is not small enough, so you shall consider splitting it into smaller commits.

## Valid commit examples

### Commit message with scope

```
feat(PL-123): add Polish language
```

### Commit message for optional scope

```
docs: correct spelling of CHANGELOG
```

### Commit message with description and breaking change footer

```
feat(PL-123): allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other
config files
```

### Commit message with multi-paragraph body and multiple footers

```
fix(PL-123): prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: John Doe
```
