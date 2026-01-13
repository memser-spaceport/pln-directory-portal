# Fund Data Enrichment CLI

A CLI tool to enrich investment fund/company data using AI-powered web search.

## Features

- **AI-Powered Enrichment**: Uses GPT-4o with web search to find missing company information
- **Dry-Run Mode**: Generate JSON for review before applying changes
- **Safe Apply**: Updates database and generates rollback SQL automatically
- **Rollback Support**: Easily revert changes using generated SQL scripts
- **Logo Validation**: Validates logo URLs exist before including them

## Usage

### Step 0: Build

```bash
npm run api:enrich-funds:build
```

### Step 1: Generate enrichment JSON (dry-run)

```bash
# Process all funds with incomplete data (with limit)
npm run api:enrich-funds -- dry-run --output ./funds.json --limit 10

# Process a specific fund by UID
npm run api:enrich-funds -- dry-run --output ./funds.json --fund-uid cmkcykdib0001f5n369i3j0oe
```

### Step 2: Review the JSON file, then apply changes

```bash
npm run api:enrich-funds -- apply --input ./funds.json
```

This will:
- Update the database with enriched data
- Generate a rollback SQL file (e.g., `rollback-2026-01-13T20-07-13-400Z.sql`)

### Step 3: If needed, rollback using the generated SQL

```bash
npm run api:enrich-funds -- rollback --input ./rollback-2026-01-13T20-07-13-400Z.sql
```

## Configuration

Add to `.env` if you want to use a different model (defaults to `gpt-4o`):

```bash
OPENAI_FUND_ENRICHMENT_MODEL=gpt-5
```

The script uses the existing `OPENAI_API_KEY` already configured in the project.

### Debug Mode

To see AI responses in the console:

```bash
DEBUG_ENRICHMENT=true npm run api:enrich-funds -- dry-run --limit 1
```

## Command Options

### dry-run

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output JSON file path (default: `./enriched-funds-{timestamp}.json`) |
| `-l, --limit <number>` | Limit number of funds to process |
| `-f, --fund-uid <uid>` | Process specific fund by UID |

### apply

| Option | Description |
|--------|-------------|
| `-i, --input <path>` | Input JSON file from dry-run (required) |

### rollback

| Option | Description |
|--------|-------------|
| `-i, --input <path>` | Rollback SQL file (required) |

## Output JSON Format

```json
{
  "metadata": {
    "generatedAt": "2026-01-13T19:15:14.574Z",
    "totalFunds": 10,
    "enrichedFunds": 8,
    "skippedFunds": 2,
    "modelUsed": "gpt-4o",
    "version": "1.0.0"
  },
  "funds": [
    {
      "uid": "clxxxx123",
      "name": "Example Company",
      "originalData": { ... },
      "enrichedData": {
        "website": "https://example.com",
        "blog": null,
        "linkedinHandler": "company/example",
        "shortDescription": "...",
        "longDescription": "...",
        "moreDetails": "...",
        "investmentFocus": ["AI", "Web3", "Privacy"],
        "logoUrl": "https://example.com/logo.png"
      },
      "confidence": { ... },
      "sources": ["https://..."],
      "status": "enriched",
      "fieldsUpdated": ["website", "investmentFocus"]
    }
  ],
  "skipped": []
}
```

## Fields Enriched

| Field | Description |
|-------|-------------|
| `website` | Official website URL |
| `blog` | Blog URL |
| `linkedinHandler` | LinkedIn company handle (e.g., `company/example`) |
| `shortDescription` | 1-2 sentence summary (max 200 chars) |
| `longDescription` | Detailed description (max 1000 chars) |
| `moreDetails` | Additional context (team, history, achievements) |
| `investmentFocus` | Array of 3-8 tags (e.g., `["AI", "Crypto", "Web3"]`) |
| `logoUrl` | Validated logo image URL |

## Notes

- Logo URLs are validated via HEAD request to ensure they exist and return an image
- Only fields that were originally empty/null will be marked for update
- The script only updates funds where `isFund=true` in the database
