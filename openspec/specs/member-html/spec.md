# member-html Specification

## Purpose

Member rich-text fields that the frontend renders as HTML (`Member.bio` and `MemberExperience.description`) are sanitized when they are written, whatever writes them: the profile editor, the Forest Admin panel, CV import, enrichment or an AI-generated bio (LAB-2987).

## Requirements

### Requirement: Sanitize member HTML on every write path

Every create, update, upsert, createMany and updateMany of `Member.bio` or `MemberExperience.description` through `PrismaService` SHALL pass the value through `sanitizeMemberHtml` (`apps/web-api/src/members/member-html.util.ts`) before it is stored. Creates and updates of these fields from the Forest Admin panel SHALL pass through the same sanitizer in a `Before` hook.

#### Scenario: A member saves a bio with a script tag

- **GIVEN** a bio `<p>Hello <script>alert(1)</script>world</p>`
- **WHEN** it is saved
- **THEN** the stored bio is `<p>Hello world</p>`

#### Scenario: An admin edits a bio in Forest Admin

- **GIVEN** a bio with an `onerror` attribute
- **WHEN** an admin saves it in the Forest Admin panel
- **THEN** the stored bio has no event-handler attribute

### Requirement: Remove content that can run code

The sanitizer SHALL remove script and style elements with their content, event-handler attributes, `srcset`, and URLs with a scheme other than `http`, `https`, `mailto`, `tel` or `sms` (images also allow `data:`), including protocol-relative URLs. It SHALL add `rel="noopener noreferrer"` to links with a `target`.

#### Scenario: An AI-generated bio with an event handler

- **GIVEN** a generated bio with an `onerror` or `onclick` attribute
- **WHEN** it is saved
- **THEN** the stored bio has no event-handler attribute and keeps its links, images and the AI disclaimer

#### Scenario: A link with a javascript: URL

- **GIVEN** a bio with `<a href="javascript:alert(1)">a</a>`
- **WHEN** it is saved
- **THEN** the stored link has no `href`

### Requirement: Keep the editor's formatting

The sanitizer SHALL keep the formatting the profile editor writes: paragraphs, headers, bold, italic, underline, strike, colors, lists, alignment and indent classes (`ql-*`), code blocks, links, member mentions and hosted images.

#### Scenario: A bio saved from the profile editor

- **GIVEN** a bio with headers, colors, lists, a code block, a mention and an image
- **WHEN** it is saved
- **THEN** the stored bio is unchanged

### Requirement: One-time clean-up of stored values

`yarn api:sanitize-member-html` SHALL list the members and experiences whose stored HTML has content the sanitizer removes for safety (uids and lengths only) and change nothing. With `--apply`, which a human runs only after approving the dry-run, it SHALL write the sanitized value for those rows only.

#### Scenario: Dry-run

- **GIVEN** one stored bio with a script tag
- **WHEN** the script runs without `--apply`
- **THEN** it reports one member bio to clean and the bio is unchanged

### Requirement: Clean-up leaves harmless values alone

The clean-up SHALL count a value as unsafe only when it has script-like elements, event-handler attributes, unsafe inline styles, `srcset`, or URLs the sanitizer removes. A value with only harmless formatting or a different entity encoding SHALL stay as it is. A row edited after the script read it SHALL stay as it is.

#### Scenario: Pasted formatting only

- **GIVEN** a stored bio with `<span style="font-size:11pt">`
- **WHEN** the script runs with `--apply`
- **THEN** the bio is not counted and not changed

#### Scenario: A data: link

- **GIVEN** a stored bio with `<a href="data:text/html,...">`
- **WHEN** the script runs without `--apply`
- **THEN** the bio is counted
