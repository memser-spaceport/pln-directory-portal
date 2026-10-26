# member-html Specification

## Purpose
Member rich-text fields that the frontend renders as HTML (`Member.bio` and `MemberExperience.description`) are sanitized when they are written, whatever writes them: the profile editor, the admin panel, CV import, enrichment or an AI-generated bio (LAB-2987).

## Requirements
### Requirement: Sanitize member HTML on write
Every create, update, upsert, createMany and updateMany of `Member.bio` or `MemberExperience.description` through `PrismaService` SHALL pass the value through `sanitizeMemberHtml` (`apps/web-api/src/members/member-html.util.ts`) before it is stored. The sanitizer SHALL remove script and style elements with their content, event-handler attributes, and `javascript:` (and any other non-allowed scheme or protocol-relative) URLs, SHALL add `rel="noopener noreferrer"` to links with a `target`, and SHALL keep the formatting the profile editor writes: paragraphs, headers, bold, italic, underline, strike, colors, lists, alignment and indent classes (`ql-*`), code blocks, links, member mentions and hosted images.

#### Scenario: A member saves a bio with a script tag
- **GIVEN** a bio `<p>Hello <script>alert(1)</script>world</p>`
- **WHEN** it is saved
- **THEN** the stored bio is `<p>Hello world</p>`

#### Scenario: An AI-generated bio with an event handler
- **GIVEN** a generated bio with an `onerror` or `onclick` attribute
- **WHEN** it is saved
- **THEN** the stored bio has no event-handler attribute and keeps its links, images and the AI disclaimer

### Requirement: One-time clean-up of stored values
`yarn api:sanitize-member-html` SHALL list the members and experiences whose stored HTML has unsafe content (uids and lengths only) and change nothing. With `--apply`, which a human runs only after approving the dry-run, it SHALL write the sanitized value for those rows only. Unsafe content means script-like elements, event-handler attributes, unsafe inline styles or non-allowed URL schemes; values with only harmless formatting or a different entity encoding SHALL stay as they are.

#### Scenario: Dry-run
- **GIVEN** one stored bio with a script tag
- **WHEN** the script runs without `--apply`
- **THEN** it reports one member bio to clean and the bio is unchanged
