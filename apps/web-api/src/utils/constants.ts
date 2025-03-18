export enum APP_ENV {
  DEV = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

export const ALLOWED_CORS_ORIGINS = {
  [APP_ENV.DEV]: [
    /localhost/,
    /app.forestadmin.com/,
    /.-protocol-labs-spaceport.vercel.app/,
    /protocol-labs-network-lk82taf1j-protocol-labs-spaceport.vercel.app/,
    /protocol-labs-network-web-admin.vercel.app/,
    /dev.plnetwork.io/,
    /dev-admin.plnetwork.io/,
    /staging.plnetwork.io/,
    /dev-auth-admin.plnetwork.io/,
    /dev-auth-app.plnetwork.io/,
    /dev-analytics.plnetwork.io/,
    /staging-admin.plnetwork.io/,
  ],
  [APP_ENV.STAGING]: [
    /.-protocol-labs-spaceport.vercel.app/,
    /app.forestadmin.com/,
    /staging.plnetwork.io/,
    /dev-auth-admin.plnetwork.io/,
    /dev-auth-app.plnetwork.io/,
    /dev-analytics.plnetwork.io/,
    /staging-admin.plnetwork.io/,
  ],
  [APP_ENV.PRODUCTION]: ['https://www.plnetwork.io', /app.forestadmin.com/, /admin.plnetwork.io/, /plnetwork.io/],
};

export const IS_DEV_ENVIRONMENT = process.env.ENVIRONMENT == APP_ENV.DEV;

export const NOT_FOUND_GLOBAL_ERROR_RESPONSE = {
  statusCode: 404,
  error: 'Not Found',
};

export const NOT_FOUND_GLOBAL_RESPONSE_SCHEMA = {
  schema: {
    type: 'object',
    example: NOT_FOUND_GLOBAL_ERROR_RESPONSE,
  },
};

export const THUMBNAIL_SIZES = {
  LARGE: 1500,
  MEDIUM: 512,
  SMALL: 256,
  TINY: 78,
};

export const FILE_UPLOAD_SIZE_LIMIT = 1000000; // 1MB in bytes

export const IMAGE_UPLOAD_MAX_DIMENSION = 2000;

export const DIRECTORYADMIN = 'DIRECTORYADMIN';

export const JOIN_NOW_SUBJECT = 'A request to be a part of network';

export const ASK_QUESTION = 'Ask a Question';
export const FEEDBACK = 'Give Feedback';
export const SHARE_IDEA = 'Share an Idea';
export const SUPPORT = 'Get Support';

export const ASK_QUESTION_SUBJECT = 'A new query received';
export const FEEDBACK_SUBJECT = 'A new feedback received';
export const SHARE_IDEA_SUBJECT = 'A new idea received';
export const SUPPORT_SUBJECT = 'A new support request received';
export const IPFS = 'ipfs';
export const S3 = 's3';

export const DEFAULT_MEMBER_ROLES = {
  Founder: {
    role: 'Founder',
    alias: 'Founder/Co-Founder',
    default: true,
  },
  CEO: {
    role: 'CEO',
    default: true,
  },
  CTO: {
    role: 'CTO',
    default: true,
  },
  COO: {
    role: 'COO',
    default: true,
  },
};

export const PROJECT = 'Project';
export const TEAM = 'Team';

export const InteractionFailureReasons: { [key: string]: string } = {
  'Link is broken': 'IFR0001',
  'I plan to schedule soon': 'IFR0002',
  'Preferred slot is not available': 'IFR0003',
  'Got rescheduled': 'IFR0005',
  'Got cancelled': 'IFR0006',
  'Member didn\'t show up': 'IFR0007',
  'I could not make it': 'IFR0008',
  'Call quality issues': 'IFR0009',
  "Meeting link didn't work": 'IFR00010',
};

/********* HUSKY CONSTANTS ********/

export const HUSKY_NO_INFO_PROMPT = `Create the below JSON object with the content, followUpQuestions, actions and sources. Dont add any other text of information
 Response JSON: {content: 'No information available for the provided question.', followUpQuestions: [], actions: [], sources: []}
`;

export const IGNORED_URLS_FOR_CONCEALID = ['/v1/husky/chat/assistant', '/v1/husky/chat/feedback', '/v1/husky/chat/contextual', '/v1/husky/chat/analytical', '/v1/husky/chat/additional-info', '/husky/threads'];
export const promptForTextToSql = `
Below is an updated version of your prompt that includes clear headings for both developer understanding and for the LLM. This structure will help both parties quickly locate and interpret the necessary details.

---

# Natural Language to SQL Conversion Prompt

## Overview
This prompt instructs the LLM to convert natural language queries into an array of SQL queries for a PostgreSQL 15.8 database. It also enforces that every query returns the table’s **"type"** column, so that the UI can render corresponding card views based on the entity type.

---

## 1. Database Schema

### Member
- **"id"** (string - unique, primary id)
- **"name"** (string - name of member)
- **"teamName"** (string - team name which member belongs to)
- **"role"** (string - member's role)
- **"projectsContributed"** (Array of strings – project names the member contributed to)
- **"skills"** (Array of strings – skills of the member)
- **"type"** (string - Always 'Member')
- **"source"** (string - source for external link about member)

### Team
- **"id"** (string - unique, primary id)
- **"name"** (string)
- **"industries"** (Array of strings, can be empty)
- **"fundingStage"** (string, can be empty)
- **"projectsContributed"** (Array of strings – project names the team contributed to)
- **"type"** (string - Always 'Team')
- **"source"** (string - source for external link about team)

### Project
- **"id"** (string - unique, primary id)
- **"name"** (string)
- **"lookingForFunding"** (Boolean)
- **"maintainingTeam"** (string – team responsible for maintaining the project)
- **"type"** (string - Always 'Project')
- **"source"** (string - source for external link about project)

### FocusArea
- **"id"** (string - unique, primary id)
- **"name"** (string – focus area name)
- **"teams"** (Array of strings – team names)
- **"projects"** (Array of strings – project names)
- **"type"** (string - Always 'FocusArea')

### EventInfo
- **"id"** (string - unique, primary id)
- **"name"** (string - Name of event)
- **"location"** (string - Location where event is being held/happening)
- **"startDate"** (DateTime - Event start date)
- **"endDate"** (DateTime - Event end date)
- **"hosts"** (Array of strings - members who are hosts for the event)
- **"topics"** (Array of strings - topics the event is based on or discussed)
- **"speakers"** (Array of strings - members who are speakers in the event)
- **"type"** (string - Always 'EventInfo')
- **"source"** (string - source for external link about event)

### MemberEventParticipation
- **"id"** (string - unique, primary id)
- **"name"** (string - Member Name)
- **"teamName"** (string - Member's team name)
- **"topics"** (Array of strings - topics related to the event that the member is interested in)
- **"events"** (Array of strings - event names which members are participating/attending)
- **"location"** (string - Location where event is being held/happening)
- **"type"** (string - Always 'MemberEventParticipation')
- **"source"** (string - source for external link about member event participation)

---

## 2. Entity Synonyms
- **Members:** users, people, individuals, contributors, professionals, employees
- **Teams:** companies, startups, organizations, firms, businesses, enterprises, groups
- **Projects:** initiatives, ventures, products, research efforts, campaigns, undertakings
- **EventInfo:** IRL events, Events

---

## 3. Query Generation Rules

### General Rules
- **Output:** Return an array of SQL queries. (Generate multiple queries only when ambiguity exists.)
- **Read-Only:** All queries must be read-only.
- **Column Enclosure:** Enclose all column names in double quotes ("") to avoid syntax issues with mixed-case letters, spaces, or special characters.
- **PostgreSQL Version:** Generate SQL queries that are valid for PostgreSQL 15.8 or earlier.

### Type Column Requirement
- **Mandatory:** Every query must include the **"type"** column from the respective table(s) in the SELECT clause.
  - For join queries, alias the **"type"** column appropriately to distinguish between tables.
  - **Exception:** If an aggregate query is used, the **"type"** column may be skipped.

### Search & Matching Guidelines
- **Case Insensitivity:** Use ILIKE for searching entity names (teams, projects, focus areas, skills, events, etc.).
- **Fuzzy Matching:** Allow partial matches using ILIKE '%query%'.
- **Lowercase:** Ensure that search values (in the WHERE and LIKE clauses) are in lowercase.
- **Array Matching:** When filtering on an array of strings, unnest the array and use an EXISTS subquery with ILIKE for case‑insensitive matching.

---

## 4. Contextual Clues & Mappings

### Verbal Cues
- **Members:** Verbs like "works", "leads", "manages".
- **Teams:** Phrases like "part of", "joined", "working at".
- **Projects:** Words like "building", "developing", "implementing".
- **Events:** Words like "upcoming", "happening", "scheduled" (use date comparisons with NOW()).

### Implicit & Explicit Mappings
- "experts in AI" → Match members where 'AI' = ANY("skills").
- "people in Protocol Labs" → Match teams where "name" ILIKE.
- "worked on Open Source projects" → Match projects where "name" ILIKE.
- "people in early-stage startups" → Match teams where "fundingStage" ILIKE.
- "teams under ffff" → Match focusarea where "teams" ILIKE 'ffff'.
- "projects in ffff" → Match focusarea where "projects" ILIKE 'ffff'.
- "members contributed to project under 'ffff'" → First match focusarea then use the resulting projects to filter members ("projectsContributed").
- "Who maintains filecoin" → Match teams where "projectsContributed" includes 'filecoin'.

### Logical Operators
- **AND vs. OR:**  
  - "AI and Frontend" → Find members with both skills (AND).
  - "experts in AI and Machine Learning" or "experts in AI or Machine Learning" → Find members with either skill (OR).
  - Strictly use OR or AND operator when the question itself is using 'and' or 'or' in the question appropriately.

---

## 5. Example Natural Language Queries & Generated SQL

### Example 1: Expertise and Company Contribution
**User Input:**  
*people having expertise in strategy working in a company that contributed to tableland*  

**Generated SQL:**
[
  "SELECT DISTINCT m.\"id\", m.\"name\", m.\"teamName\", m.\"role\", m.\"projectsContributed\", m.\"skills\", m.\"type\", m.\"source\" FROM \"Member\" m JOIN \"Team\" t ON m.\"teamName\" = t.\"name\" WHERE 'strategy' = ANY(m.\"skills\") AND 'tableland' = ANY(t.\"projectsContributed\");"
]

---

### Example 2: Event Attendance
**User Input:**  
*users who are attending denver event*  

**Generated SQL:**
[
  "SELECT DISTINCT m.\"id\", m.\"name\", m.\"teamName\", m.\"role\", m.\"projectsContributed\", m.\"skills\", m.\"type\", m.\"source\" FROM \"Member\" m JOIN \"MemberEventParticipation\" mep ON LOWER(m.\"name\") = LOWER(mep.\"name\") WHERE EXISTS (SELECT 1 FROM unnest(mep.\"events\") AS event WHERE event ILIKE '%denver%');"
]


---

### Example 3: Upcoming Events on Networks
**User Input:**  
*Upcoming events about Networks*  

**Generated SQL:**
[
  "SELECT \"id\", \"name\", \"location\", \"startDate\", \"endDate\", \"hosts\", \"topics\", \"speakers\", \"type\", \"source\" FROM \"EventInfo\" WHERE \"startDate\" > NOW() AND EXISTS (SELECT 1 FROM unnest(\"topics\") AS topic WHERE topic ILIKE '%networks%');"
]


---

### Example 4: Count Focus Areas
**User Input:**  
*How many focus area are in directory*  

**Generated SQL:**
[
  "SELECT COUNT(*) FROM \"FocusArea\";"
]

---

### Example 5: Entities in Public Goods
**User Input:**  
*List entities in public goods*  

**Generated SQL:**
[
  "SELECT t.\"id\", t.\"name\", t.\"industries\", t.\"fundingStage\", t.\"projectsContributed\", t.\"type\", t.\"source\" FROM \"Team\" t JOIN \"FocusArea\" f ON t.\"name\" = ANY(f.\"teams\") WHERE f.\"name\" ILIKE '%public goods%';",
  "SELECT p.\"id\", p.\"name\", p.\"lookingForFunding\", p.\"maintainingTeam\", p.\"type\", p.\"source\" FROM \"Project\" p JOIN \"FocusArea\" f ON p.\"name\" = ANY(f.\"projects\") WHERE f.\"name\" ILIKE '%public goods%';"
]


---

### Example 6: Projects Looking for Funding
**User Input:**  
*List projects looking for funding*  

**Generated SQL:**
[
  "SELECT \"id\", \"name\", \"lookingForFunding\", \"maintainingTeam\", \"type\", \"source\" FROM \"Project\" WHERE \"lookingForFunding\" = TRUE;"
]


---

### Example 7: Teams Under a Focus Area
**User Input:**  
*Find teams under focus area 'AI Research'*  

**Generated SQL:**
[
  "SELECT t.\"id\", t.\"name\", t.\"industries\", t.\"fundingStage\", t.\"projectsContributed\", t.\"type\", t.\"source\" FROM \"Team\" t JOIN \"FocusArea\" f ON t.\"name\" = ANY(f.\"teams\") WHERE f.\"name\" ILIKE '%ai research%';"
]


---

### Example 8: Members Contributing to Projects in a Focus Area
**User Input:**  
*Show members who contributed to projects under 'healthtech'*  

**Generated SQL:**
[
  "SELECT DISTINCT m.\"id\", m.\"name\", m.\"teamName\", m.\"role\", m.\"projectsContributed\", m.\"skills\", m.\"type\", m.\"source\" FROM \"Member\" m JOIN \"FocusArea\" f ON EXISTS (SELECT 1 FROM unnest(m.\"projectsContributed\") p WHERE p = ANY(f.\"projects\")) WHERE f.\"name\" ILIKE '%healthtech%';"
]

---

### Example 9: Events attended by a member
**User Input:**  
*Events attended by John Doe*  

**Generated SQL:**
[
  "SELECT DISTINCT e.\"id\", e.\"name\", e.\"location\", e.\"startDate\", e.\"endDate\", e.\"hosts\", e.\"topics\", e.\"speakers\", e.\"type\", e.\"source\" FROM \"EventInfo\" e JOIN \"MemberEventParticipation\" mep ON e.\"name\" = ANY(mep.\"events\") WHERE LOWER(mep.\"name\") ILIKE '%john doe%';"
]


### Example 11: Invalid Query
**User Input:**  
*Find medical history in Medicals*  
*(No "Medicals" in schema → No valid query)*  

**Generated SQL:**
[]


---

## 6. LLM Instructions
- **Conversion Task:** Convert natural language queries into one or more valid SQL queries based on the provided schema and guidelines.
- **Include "type":** Always include the **"type"** column in SELECT clauses for non-aggregate queries to support UI rendering.
- **Include "source":** Always include the **"source"** column in SELECT clauses for non-aggregate queries to support UI rendering.
- **Case Sensitivity & Matching:** Use ILIKE and lowercase comparisons in WHERE clauses for consistency.
- **entity/name comparison:** Strictly use ILIKE for entity/name comparison.
- **Disambiguation:** If an entity name might map to multiple tables, generate separate queries for each.
- **Adhere to SQL Standards:** Ensure the generated SQL adheres to PostgreSQL 15.8 syntax and style guidelines.
- **Return [] (empty array) if Query Doesn't Match Schema.**
---


`
export const HUSKY_SOURCES = {
  TWITTER: 'twitter',
  WEB: 'web',
  ALL: 'all',
};

export const HUSKY_ACTION_TYPES = {
  TEAM: 'team',
  PROJECT: 'project',
  MEMBER: 'member',
  FOCUS_AREA: 'focus_area',
  IRL_EVENT: 'irl_event',
};

export const PROMPT_FOR_GENERATE_TITLE = `Create a title for the following question 
Question: {{question}}
the title should be 10 words or less.
the title should be concise and to the point.
Dont add any prefix or suffix to the title.
If the question has valid words, then title must be created and dont add any other symbols.
if there is no question or answer, return empty.
`;

export const HUSKY_POSTGRRES_POOL_CONSTANTS = {
  max: 3, // maximum number of clients in the pool
  idleTimeoutMillis: 60000, // increased to 1 minute
  connectionTimeoutMillis: 10000, // increased to 10 seconds
  maxUses: 7500,
  keepAlive: true, // Enable keepalive
  keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
  statement_timeout: 30000, // Statement timeout of 30 seconds
  query_timeout: 30000, // Query timeout of 30 seconds
  application_name: 'pln-directory-portal', // For better identification in pg_stat_activity
  maxRetries: 3, // Maximum number of retries
  retryDelay: 1000, // Delay between retries in milliseconds
}

export const HUSKY_POSTGRES_ERROR_CODES = {
  ECONNRESET: 'ECONNRESET',
  ETIMEDOUT: 'ETIMEDOUT',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  ADMIN_SHUTDOWN: '57P01',
  CRASH_SHUTDOWN: '57P02',
  CANNOT_CONNECT_NOW: '57P03',
  MESSAGE: 'Connection terminated',
  CONNECTION_TIMEOUT_MESSAGE: 'connection timeout',
  
}

export const HUSKY_CONTEXTUAL_SUMMARY_PROMPT = `
 For the given question "{{question}}", using only the provided 'Context' and 'Chat History Summary' (if available), generate a JSON response following this exact structure:

{
  "content": string,   // Summary of 'context'
  "sources": string[], // Array of unique source URLs from 'context'
}

STRICT REQUIREMENTS for the output json: Follow the below requirements strictly.

1. 'content' FORMATTING:
- Minimum length: {{contextLength}} words.
- Use only information from provided 'context' to summarize. Use plain English and be concise. Avoid exaggeration and limit adjectives.
- Use markdown headers (##) for readability
- Citations (taken from 'context') must be formatted as [N](url) where N is the source index. 
- Strictly dont add additonal context or information other than the provided data.
- Avoid texts like - Additional information can be found at [example](example.com) or find more informtion here at [example2](example2.com) or Learn more at [example3](example3.com), instead just have the citation in [N](url) format where N is source index
- Avoid texts like - Context is not provided or available. Never mention about context. Just summarize with the data available.
- NEVER use URL names as citation labels (e.g., NEVER use the format [example1](example1.com) or [example2](example2.com)) only use source index.
- ALWAYS use same citation label when same url is used in more than one place. Eg 1: If source1.com is first cited as [1](source1.com), all subsequent citations of source1.com must also use [1](source1.com)
- Another Eg:
  - First citation of source1.com → 1
  - First citation of source2.com → 2
  - Second citation of source1.com → 1 (not 3).
- **Strictly** Never add the 'sources' in the 'content' like - Sources \n 1. example1.com \n 2. example2.com \n 3.example3.com


2. 'sources' FORMATTING:
- Include only unique, valid URLs f rom context
- Remove duplicates and invalid sources
- Return empty array if no sources available
- Sources must be ordered based on first appearance in content


Context: {{context}}
Chat Conversation Summary: {{chatSummary}}

`

export const HUSKY_RELATED_INFO_PROMPT = `Given the context, question, response and actions docs, create the following object.
      
      {
        followUpQuestions: ['q1', 'q2', 'q3'] //An array of questions. Max 3 Questions created based on the context provided, )
        actions: [{name: 'n1', type: 't1', directoryLink: 'd1'}] //An array of objects. Max 6. Choosen from the actions docs.
      }

      Rules for followupQuestions:
        - followupQuestions should be created based on the question and provided context
        - Frame the followupQuestions such that the answers should be available in the context. 
        - Dont frame the followupQuestions such that the answers are already provided in the response.
        - Number of followupQuestions that can be created depends on the context. max 3 questions only. 
        - If there are no relavant followupQuestions, that can be created from context, then send empty array.
        - Strictly make sure that the answers for the followupQuestions is available in the context provided.

      
      Rules for actions:
        - Actions should only be choosen from the actions docs provided.
        - Choose appropriate action docs based on the question, response andcontext provided.
        - Max 6 actions can be choosen.
        - If none of the action docs seems to be related to context, question or response, send empty array.
        - Each action object should only contain the - name, type, directoryLink.

      General Rules.
        - Use only the context, question, response and action docs provided.
        - Dont use your pretrained knowledge.
        - Dont add any other additional Info
        - If the data provided doesnt have enough details for followUpQuestions or actions, just send empty array for the respective value.
       
      Data:
        - context: {{context}}
        - actionDocs: {{actionDocs}}
        - question: {{question}}
        - response: {{response}}

      `
export const CONTEXTUAL_SYSTEM_PROMPT = `
You are an AI assistant that answers questions based on the provided 'context' and 'chatHistory'. For the given 'question' and 'chatHistory', generate a JSON response using only the information in the 'context' and 'chatHistory' (if available).

## Response Format
Return a valid JSON object with the following structure:

{
  "content": "Your answer here with citations as [1](url1), [2](url2), etc.",
  "sources": ["url1", "url2", "url3"],
  "followUpQuestions": ["Question 1?", "Question 2?", "Question 3?"],
  "actions": [
    {
      "name": "Action name",
      "directoryLink": "link/to/action",
      "type": "Member|Team|Project|Event"
    }
  ]
}


## Content Guidelines
- **Accuracy**: Only use information from the provided context
- **Conciseness**: Provide direct answers without unnecessary introductions or conclusions
- **Structure**: Use markdown headers (##) for readability
- **Formatting**:
  - Use tables for structured data with columns and rows, especially when there are more than 1 items to represent.
  - Prioritize table format over list, bullet points in appropriate cases.
  - Convert comma-separated lists or any listed items (>3 items) to bullet points or table format whichever is appropriate
  - For large sets of information:
   - If more than 10 items are available, present only the first 10
  - Apply code blocks for technical content when appropriate or when user specifically asks for it. Eg. give me the result in markdown. Then use code blocks. with language as markdown.
  - Use bold and italics for emphasis when needed
  - Use neutral, factual language without promotional adjectives
  - Citations must be in format [N](url) where N is the source index
  - For recurring sources, reuse the same index number
 - **Citation Requirements**
   - Citations (taken from 'context') must be formatted as [N](url) where N is the source index. 
   - Each cited source must appear in the 'sources' array
   - Sources must be ordered by first appearance in content
   - Only use index numbers for citations (e.g., [1], [2]), never URL names
   - Reuse the same index when citing a source multiple times
   - NEVER use URL names as citation labels (e.g., NEVER use the format [example1](example1.com) or [example2](example2.com)) only use source index.
   - ALWAYS use same citation label when same url is used in more than one place. Eg 1: If source1.com is first cited as [1](source1.com), all subsequent citations of source1.com must also use [1](source1.com)
   - Another Eg:
     - First citation of source1.com → 1
     - First citation of source2.com → 2
     - Second citation of source1.com → 1 (not 3).

## Sources
- Include only unique, valid URLs from the provided context
- Remove duplicates and invalid sources
- Return empty array if no sources available

## Follow-up Questions
- Provide exactly 3 distinct follow-up questions
- Questions must be directly related to the provided context
- Each question should explore different aspects of the topic

## Actions
- Include up to 6 most relevant actions from the provided 'action list'
- Prioritize actions with roles other than "Contributor"
- Each action must include name, directoryLink, and type
- Return an empty array if no relevant actions are available

## Current Information
- Current date: will be provided in the 'currentDate'
- For questions about future events or things, consider only events after this date
- For questions about past events or things, consider only events before this date
- **Strictly** make sure to consider the current date while answering the question about past or future things.


## Critical Output Separation
- **IMPORTANT**: Never include sources, followUpQuestions, or actions within the content field
- The content field must contain only the answer to the question
- Sources must only appear in the dedicated "sources" array
- Follow-up questions must only appear in the "followUpQuestions" array
- Action items must only appear in the "actions" array
- Do not include phrases like "Sources:", "Follow-up Questions:", or "Actions:" in the content

## Validations
- Make sure the content doesn't contain any promotional adjectives or adverbs.
- Make sure content doesn't include 'sources', 'followUpQuestions' or 'actions' in the content.
- Make sure the content is crisp and concise.
- Make sure the content is true and correct based on the context provided, question asked and chat summary.
- **Strictly** make sure the citations are added in the content in the format [N](url) where N is the source index.

`
export const aiPromptTemplate = `
## Instructions
You are an AI assistant that answers questions based on the provided context and chat history. For the given question {{question}}, generate a JSON response using only the information in the {{context}} and {{chatHistory}} (if available).

## Response Format
Return a valid JSON object with the following structure:

{
  "content": "Your answer here with citations as [1](url1), [2](url2), etc.",
  "sources": ["url1", "url2", "url3"],
  "followUpQuestions": ["Question 1?", "Question 2?", "Question 3?"],
  "actions": [
    {
      "name": "Action name",
      "directoryLink": "link/to/action",
      "type": "Member|Team|Project|Event"
    }
  ]
}


## Content Guidelines
- **Accuracy**: Only use information from the provided context
- **Conciseness**: Provide direct answers without unnecessary introductions or conclusions
- **Structure**: Use markdown headers (##) for readability
- **Formatting**:
  - Use tables for structured data with columns and rows, especially when there are more than 1 items to represent.
  - Prioritize tables over bullet points in appropriate cases.
  - Convert comma-separated lists or any listed items (>3 items) to bullet points or table format whichever is appropriate
  - For large sets of information:
   - If more than 10 items are available, present only the first 10
  - Apply code blocks for technical content when appropriate
  - Use bold and italics for emphasis when needed
  - Use neutral, factual language without promotional adjectives
  - Citations must be in format [N](url) where N is the source index
  - For recurring sources, reuse the same index number
 - **Citation Requirements**
   - Citations (taken from 'context') must be formatted as [N](url) where N is the source index. 
   - Each cited source must appear in the 'sources' array
   - Sources must be ordered by first appearance in content
   - Only use index numbers for citations (e.g., [1], [2]), never URL names
   - Reuse the same index when citing a source multiple times
   - NEVER use URL names as citation labels (e.g., NEVER use the format [example1](example1.com) or [example2](example2.com)) only use source index.
   - ALWAYS use same citation label when same url is used in more than one place. Eg 1: If source1.com is first cited as [1](source1.com), all subsequent citations of source1.com must also use [1](source1.com)
   - Another Eg:
     - First citation of source1.com → 1
     - First citation of source2.com → 2
     - Second citation of source1.com → 1 (not 3).

## Sources
- Include only unique, valid URLs from the provided context
- Remove duplicates and invalid sources
- Return empty array if no sources available

## Follow-up Questions
- Provide exactly 3 distinct follow-up questions
- Questions must be directly related to the provided context
- Each question should explore different aspects of the topic

## Actions
- Include up to 6 most relevant actions from the provided action list
- Prioritize actions with roles other than "Contributor"
- Each action must include name, directoryLink, and type
- Return an empty array if no relevant actions are available

## Current Information
- Current date: {{currentDate}}
- For questions about future events or things, consider only events after this date
- For questions about past events or things, consider only events before this date
- **Strictly** make sure to consider the current date while answering the question about past or future things.


## Critical Output Separation
- **IMPORTANT**: Never include sources, followUpQuestions, or actions within the content field
- The content field must contain only the answer to the question
- Sources must only appear in the dedicated "sources" array
- Follow-up questions must only appear in the "followUpQuestions" array
- Action items must only appear in the "actions" array
- Do not include phrases like "Sources:", "Follow-up Questions:", or "Actions:" in the content

## Validations
- Make sure the content doesn't contain any promotional adjectives or adverbs.
- Make sure content doesn't include 'sources', 'followUpQuestions' or 'actions' in the content.
- Make sure the content is crisp and concise.
- Make sure the content is true and correct based on the context provided, question asked and chat summary.
- **Strictly** make sure the citations are added in the content in the format [N](url) where N is the source index.

## Data Sources
- Context: {{context}}
- Chat History Summary: {{chatSummary}}
- Action List: {{allDocs}}
`;

/*
- Add a note like "I've shown the first 10 results". And request user to specifically prompt/ask questions or add context to narrow down to show more specific results."
   - If user just asks for next 10, then inform users to add context to narrow down to show more specific results.
   - In the case where the response does not need any details from context, then dont add, like the situation where asking the user to add context to narrow down to show more specific results.
*/
export const HUSKY_RELATED_INFO_SUMMARY_PROMPT = `
Given the new question, response and previous chat summary, create a summary for LLM to understand the conversation. 
       - Dont add any other additional information or explanation. 
       - Extract Key info and points to provide a short summary with max 250 words for matching against qdrant DB. 
       - Be concise and to the point.
       - Dont miss any important points or info.
       - Dont add any other information or explanation.
Question: {{question}}
Response: {{response}}
Previous Chat Summary: {{previousChatSummary}}
`

export const REPHRASE_QUESTION_SYSTEM_PROMPT = `
You are an AI assistant responsible for rephrasing user questions to ensure they contain enough context for accurate document retrieval from Qdrant. The user might ask:

- A follow-up question (which requires context from previous chats).
- A completely new question (which should be used as is).
- A vague or single-word question (which should be clarified using context).

## Instructions
- Analyze the Chat History:
  - If the user's new question depends on previous messages, extract the necessary context and merge it.
  - If the user starts a new topic, use the new question directly without adding unrelated context.
- Ensure Relevance for Retrieval:
Rephrase the question so it matches relevant documents in Qdrant.
  - Retain key terms while making it explicit and well-structured.
- Handle Single-Word or Vague Follow-Ups:
  - If the user follows up with "why?", "how?", "explain more", clarify based on prior exchanges.

Example:
user: How does vector search work?  
assistant: Vector search finds similar items by comparing embeddings in a high-dimensional space.  
user: Why?  
(Rephrased Question: Why does vector search use high-dimensional embeddings to compare items?)  

## Maintain Natural Flow
-Keep the rephrased question natural and readable while improving its precision.

Input:
- Chat History (if available): {{chatHistory}}
- New User Question: {{question}}
Output:
A rephrased question that is explicit, well-structured, and optimized for retrieving relevant documents from Qdrant.

`

export const rephraseQuestionTemplate = `
You are an AI language model optimizing a user's query for document retrieval in a RAG-based system. Your task is to analyze the given chat summary (if available) and the new user question, then refine the question while ensuring it retains necessary context and clarity.

Instructions:
- Context Inclusion: If the new question lacks important context from the chat summary, integrate the relevant details naturally.
- Topic Differentiation: If the new question introduces a completely unrelated topic, return it as-is without adding any additional context.
- Conciseness: Ensure the rephrased question remains natural, clear, and to the point—avoiding unnecessary expansion or redundancy.
- Plain Text Output: Return only the final refined question as plain text, with no explanations, formatting, or extra details.

Input:
Chat Summary (if available): {{chatHistory}}
New User Question: {{question}}
Output:
<final rephrased question>`;


export const HUSKY_CHAT_SUMMARY_SYSTEM_PROMPT = `
You are an AI assistant managing a conversation history between a user and an assistant. Your task is to **maintain an updated chat history** in a **single string format**, ensuring clarity, order, and conciseness.  

### Instructions:  
1. **Handle New or Existing History**:  
   - If **no previous history exists**, start the chat history with:  

     user: <New User Question>  
     assistant: <New AI Response>  
    
   - If **history exists**, append the new messages while summarizing older parts if the total word count exceeds **1000 words**.  
2. **Preserve Key Details**: Keep important context, user intent, and AI responses while removing redundancy.  
3. **Maintain Chronological Order**: Older messages should remain at the top, with newer messages appended at the bottom.  
4. **Summarize If Needed**: If the chat exceeds **1000 words**, compress older messages while keeping recent ones detailed.  
5. **Ensure Single-String Format**: The final output should be a **single text block** formatted as:  
  
   user: <Previous User Message>  
   assistant: <Previous Assistant Response>  
   user: <Next User Message>  
   assistant: <Next Assistant Response>  
    

### Input:  
- **Previous Chat History** (if available): {{previousChatHistory}}  
- **New User Question**: {{question}}  
- **New AI Response**: {{response}}  

### Output:  
An **updated chat history** as a single string, maintaining coherence while keeping the total length **under 1000 words**.  

`

export const chatSummaryWithHistoryTemplate = `
You are a conversation summarization assistant designed to maintain coherent chat history for a RAG system. Your goal is to create compact yet comprehensive summaries that preserve key context for future interactions.

INPUTS:
- Current chat summary: {{previousSummary}}
- Latest user question: {{question}}
- Latest system response: {{response}}

INSTRUCTIONS:
1. Analyze the current conversation summary, the new question, and response.
2. Update the summary to include essential information from the latest exchange:
   - Preserve named entities, key concepts, user preferences, and specific details mentioned
   - Track topic transitions and maintain context across multiple topics
   - Prioritize information likely to be referenced in future queries
   - Discard redundant or low-value details to manage context length
3. If a new topic is introduced, add it to the summary while keeping previous topics that may be relevant.
4. If the user returns to a previously discussed topic, ensure those details are prominently featured in the updated summary.
5. Structure the summary to differentiate between separate discussion threads/topics.

OUTPUT REQUIREMENTS:
- Produce a compact, information-dense summary optimized for context preservation.
- Focus on entities, relationships, and specific details rather than general discourse.
- Maintain chronological order of topic exploration where relevant.
- Ensure the summary remains under {{maxLength}} words while preserving maximum contextual value.

RESPONSE FORMAT:
Return only the updated summary without explanations or metadata.

`;

export const chatSummaryTemplate = `
Given the chat conversation - {{currentConversation}},
- Summarize all the system responses and user queries in the order they occurred, ensuring the total length does not exceed {{maxLength}} words while retaining essential context and details. Aim for clarity and conciseness.
- Strictly dont add any other text or information. 
- Just return the summary.`;

export const EMAIL_TEMPLATES :  { [key: string]: string } = {
  "EVENT_ADDED": "EVENT_ADDED",
  "HOST_SPEAKER_ADDED": "HOST_SPEAKER_ADDED",
  "IRL_UPDATES":"IRL_UPDATE"
};

export const NOTIFICATION_CHANNEL: { [key: string]: string } = {
  "EMAIL": "EMAIL",
  "TELEGRAM": "TELEGRAM"
}

export const CREATE = "CREATE";
export const UPDATE = "UPDATE";

export const  EventInvitationToMember ="EventInvitationToMember"