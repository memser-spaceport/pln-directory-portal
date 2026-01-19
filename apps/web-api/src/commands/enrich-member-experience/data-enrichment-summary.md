# Data Enrichment for Incomplete Teams/Funds

## Overview

An AI-powered tool that automatically fills in missing information for investment funds in the directory using web search.

---

## Input: What Data We Process

We look for Teams where `isFund = true` that are missing any of these fields:

| Field | Condition |
|-------|-----------|
| website | Empty or null |
| blog | Empty or null |
| linkedinHandler | Empty or null |
| shortDescription | Empty or null |
| longDescription | Empty or null |
| moreDetails | Empty or null |
| investmentFocus | Empty array |
| logo | No image uploaded |

---

## Output: What We Enrich

| Field | What AI Finds |
|-------|---------------|
| Website | Official company URL |
| Blog | Company blog URL |
| LinkedIn | Company LinkedIn page handle |
| Short Description | 1-2 sentence summary (max 200 chars) |
| Long Description | Detailed company overview (max 1000 chars) |
| More Details | Team info, history, achievements, portfolio |
| Investment Focus | 3-8 tags (e.g., "AI", "Web3", "DeFi", "Privacy") |
| Logo | Validated company logo image URL |

---

## Workflow

| Step | Action |
|------|--------|
| 1. Dry-run | AI searches the web and generates a preview file |
| 2. Review | Human reviews proposed changes before applying |
| 3. Apply | Updates database and creates automatic rollback script |
| 4. Rollback | Revert changes if needed using generated script |

---

## Safety Features

- ✅ Human review required before any changes
- ✅ Automatic rollback SQL generated for every update
- ✅ Logo URLs validated to ensure they exist and are accessible
