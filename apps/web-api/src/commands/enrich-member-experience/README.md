# Enrich Member Experience CLI

Populate `MemberExperience` table from LinkedIn profile JSON files.

## Overview

This CLI command reads LinkedIn profile data from JSON files and populates the `MemberExperience` table for members who have no existing experience records. It matches members by their `linkedinHandler` field to the corresponding profile JSON file.

## Prerequisites

1. LinkedIn profile JSON files in the `linkedin-profiles/` directory (or custom path)
2. Files must be named `profile-{identifier}.json` where `{identifier}` matches the LinkedIn public identifier
3. Database connection configured via environment variables

## File Format

Each JSON file should contain a LinkedIn profile with the following structure:

```json
[
  {
    "fullName": "John Doe",
    "public_identifier": "john-doe-123",
    "experience": [
      {
        "position": "Senior Developer",
        "company_name": "Acme Corp",
        "location": "San Francisco, CA",
        "summary": "Led development of...",
        "starts_at": "Mar 2020",
        "ends_at": "Present"
      }
    ]
  }
]
```

### Field Mapping

| LinkedIn JSON Field | MemberExperience Column |
|---------------------|-------------------------|
| `experience.position` | `title` |
| `experience.company_name` | `company` |
| `experience.location` | `location` |
| `experience.summary` | `description` |
| `experience.starts_at` | `startDate` |
| `experience.ends_at` | `endDate` (null if "Present") |
| "Present" value | `isCurrent = true` |

### Date Format

Dates should be in "MMM YYYY" format (e.g., "Mar 2025", "Jan 2020"). The CLI also handles:
- Just year: "2020" → January 1, 2020
- "Present" → `endDate = null`, `isCurrent = true`

## LinkedIn Handler Matching

The CLI extracts the LinkedIn identifier from `Member.linkedinHandler` which can be in various formats:

| Format | Extracted Identifier |
|--------|---------------------|
| `john-doe-123` | `john-doe-123` |
| `in/john-doe-123` | `john-doe-123` |
| `https://linkedin.com/in/john-doe-123` | `john-doe-123` |
| `https://www.linkedin.com/in/john-doe-123/` | `john-doe-123` |

The extracted identifier is matched against the `public_identifier` field in the JSON profile.

## Usage

### Step 1: Build the CLI

```bash
npm run api:enrich-member-experience:build
```

### Step 2: Dry Run (Preview Changes)

Generate a JSON file with proposed changes without modifying the database:

```bash
npm run api:enrich-member-experience -- dry-run --output ./member-exp.json
```

**Options:**
- `-o, --output <path>` - Output JSON file path (default: `./member-experiences-{timestamp}.json`)
- `-l, --limit <n>` - Limit number of members to process
- `-m, --member-uid <uid>` - Process specific member by UID
- `-p, --profiles-dir <path>` - LinkedIn profiles directory (default: `./linkedin-profiles`)

**Example with all options:**
```bash
npm run api:enrich-member-experience -- dry-run \
  --output ./member-exp.json \
  --limit 100 \
  --profiles-dir ./linkedin-profiles
```

### Step 3: Review the Output

Review the generated JSON file to verify:
- Correct member-to-profile matching
- Proper date parsing
- Expected experience data

### Step 4: Apply Changes

Apply the enrichment to the database:

```bash
npm run api:enrich-member-experience -- apply --input ./member-exp.json
```

**Options:**
- `-i, --input <path>` - Input JSON file from dry-run (required)
- `-r, --rollback-output <path>` - Output path for rollback SQL file

This will:
1. Generate a rollback SQL file BEFORE making any changes
2. Insert `MemberExperience` records for each enriched member
3. Use individual transactions per member for durability

### Step 5: Rollback (If Needed)

If you need to revert the changes:

```bash
npm run api:enrich-member-experience -- rollback --input ./rollback-member-exp-{timestamp}.sql
```

## How It Works

### Processing Flow

1. **Load Profiles**: Read all `profile-*.json` files from the profiles directory
2. **Find Members**: Query members with `linkedinHandler` but NO `MemberExperience` records
3. **Match**: For each member, extract LinkedIn identifier and find matching profile
4. **Map Experiences**: Convert LinkedIn experience data to `MemberExperience` format
5. **Apply**: Insert records with individual transactions per member

### Safety Features

- **Only updates empty records**: Members with existing `MemberExperience` are skipped
- **Pre-apply verification**: Before inserting, verifies member still has no experiences
- **Rollback SQL**: Generated BEFORE any changes are made
- **Individual transactions**: If one member fails, others succeed
- **Detailed logging**: Each step is logged for debugging

### Rollback Strategy

The rollback SQL file contains DELETE statements for each affected member:

```sql
-- Member Experience Enrichment Rollback Script
-- Generated: 2024-01-15T10:30:00.000Z

BEGIN;

-- Member: John Doe (clxyz123)
DELETE FROM "MemberExperience" WHERE "memberUid" = 'clxyz123';

-- Member: Jane Smith (clxyz456)
DELETE FROM "MemberExperience" WHERE "memberUid" = 'clxyz456';

COMMIT;
```

## Bulk Processing (~670 Members)

For large batches, the CLI uses **individual transactions per member**:

- **Durability**: If one member fails, others succeed
- **Error isolation**: Easy to identify and retry failures
- **Progress logging**: Shows `[1/670] Processing: John Doe...`
- **No AI calls**: Fast processing (unlike fund enrichment)

## Troubleshooting

### No profiles found
```
No LinkedIn profiles found in the specified directory.
```
Ensure `profile-{identifier}.json` files exist in the profiles directory.

### No matching profile
```
[SKIP] No LinkedIn profile found for identifier: john-doe
```
The member's `linkedinHandler` doesn't match any profile's `public_identifier`.

### Invalid date format
```
[EnrichMemberExperience] Could not parse date: "Invalid Date"
```
The date format in the JSON is not recognized. Expected: "MMM YYYY" (e.g., "Mar 2025").

### Member already has experiences
Members with existing `MemberExperience` records are automatically skipped.

## Database Schema Reference

```sql
-- MemberExperience table
CREATE TABLE "MemberExperience" (
  "id" SERIAL PRIMARY KEY,
  "uid" TEXT UNIQUE DEFAULT uuid_generate_v4(),
  "title" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "location" TEXT,
  "description" TEXT,
  "startDate" TIMESTAMP NOT NULL,
  "endDate" TIMESTAMP,
  "isCurrent" BOOLEAN DEFAULT false,
  "memberUid" TEXT NOT NULL REFERENCES "Member"("uid")
);
```

## Files Structure

```
apps/web-api/src/commands/enrich-member-experience/
├── README.md                              # This file
├── enrich-member-experience.types.ts      # TypeScript interfaces
├── enrich-member-experience.service.ts    # Core business logic
├── enrich-member-experience.command.ts    # Main CLI command
├── enrich-member-experience.module.ts     # NestJS module
├── dry-run.subcommand.ts                  # Dry-run subcommand
├── apply.subcommand.ts                    # Apply subcommand
└── rollback.subcommand.ts                 # Rollback subcommand
```
