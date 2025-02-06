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
  'Member didn’t show up': 'IFR0007',
  'I could not make it': 'IFR0008',
  'Call quality issues': 'IFR0009',
  "Meeting link didn't work": 'IFR00010',
};

/********* HUSKY CONSTANTS ********/

export const HUSKY_NO_INFO_PROMPT = `Create the below JSON object with the content, followUpQuestions, actions and sources. Dont add any other text of information
 Response JSON: {content: 'No information available for the provided question.', followUpQuestions: [], actions: [], sources: []}
`;

export const IGNORED_URLS_FOR_CONCEALID = [
  '/v1/husky/chat/assistant',
  '/v1/husky/chat/feedback',
  '/v1/husky/search/directory-contextual',
  '/v1/husky/search/directory-non-contextual',
  '/v1/husky/search/directory'
];
export const HUSKY_SOURCES = {
  TWITTER: 'twitter',
  WEB: 'web',
  ALL: 'all',
};

export const HUSKY_ACTION_TYPES = {
  TEAM: 'team',
  PROJECT: 'project',
  MEMBER: 'member',
};

export const promptForTextToSql = `
You are an AI that converts natural language into an array of SQL queries for a PostgreSQL database. Using postgres version 15.8.

Database Schema:
Member (Stores people and their associated teams, projectsContributed, and skills)
 - name (string)
 - teamName (string)
 - role (string)
 - projectsContributed (Array of strings – project names the member contributed to)
 - skills (Array of strings – skills of the member)
Team (Stores details of teams)
 - name (string)
 - industries (Array of strings, can be empty)
 - fundingStage (string, can be empty)
 - projectsContributed (Array of strings – project names the team contributed to)
Projects (Stores details of projects)
 - name (string)
 - lookingForFunding (Boolean)
 - maintainingTeam (string – team responsible for maintaining the project)
FocusArea (Categorizes teams and projects under a focus area)
 - name (string) – focus area name
 - teams (Array of strings – team names)
 - projects (Array of strings – project names)


 Members (also called users, people, individuals, contributors, professionals, employees)
 Teams (also called companies, startups, organizations, firms, businesses, enterprises, groups)
 Projects (also called initiatives, ventures, products, research efforts, campaigns, undertakings)


Rules for Query Generation:
- Return an Array of SQL Queries (multiple queries only when ambiguity exists).
- Case-Insensitive Searches: Use ILIKE for entity names (teams, projects, focus areas, skills).
- Entity Disambiguation: If an entity name could refer to multiple tables, generate separate queries for each possible match.
- Context-Based Query Reduction: Prioritize the most relevant query to minimize unnecessary queries.
- Multi-Table Queries: Use JOINs for queries involving members, teams, projects, and focus areas.
- generate sql queries for postgres version 15.8 or earlier.
- Strictly ensure that all column names are enclosed in double quotes (""), especially when they contain mixed-case letters, spaces, or special characters.
- Strictly use lowercase search entity names used in where and like clause.
- Whenever possible use case insensitive based queries like ILIKE.
- Return [] (empty array) if Query Doesn't Match Schema.

contextual clues in the question:
  - Verbs like "works", "leads", "manages" suggest it's about a member
  - Phrases like "part of", "joined", "working at" suggest company/team
  - Words like "building", "developing", "implementing" suggest project
  - Word 'directory' is basically the app where the members, teams, projects and focus area exist

Implicit & Explicit Mappings:

- "experts in AI" → members where 'AI' = ANY(skills)
- "people in Protocol Labs" → match teams.name using ILIKE
- "worked on Open Source projects" → match projects.name using ILIKE
- "people in early-stage startups" → match teams.fundingStage using ILIKE
- "teams under ffff" → match focusarea.teams using ILIKE 'ffff'
- "projects in ffff" → match focusarea.projects using ILIKE 'ffff'
- "members contributed to project under 'ffff'" → match focusarea.projects, then find member.projects


Logical Operator (AND vs. OR) Based on Context:

- "AI and Frontend" → Find members with both skills (AND).
- "experts in AI and Machine Learning" → Find members with either skill (OR).
- "experts in AI or Machine Learning" → Find members with either skill (OR).
Fuzzy Matching for Entity Names:
Allow partial matches for names using ILIKE '%query%' for variations.


Examples of Natural Language Queries and SQL Outputs:
User Input: people having expertise in stratergy working in a company that contributed to tableland (entity 'strategy' and 'tableland' used in where clause are in lowercase)

Generated SQL:
[
 "SELECT DISTINCT m.* FROM \"Member\" m JOIN \"Team\" t ON m.\"teamName\" = t.\"name\" WHERE 'strategy' = ANY(m.\"skills\") AND 'tableland' = ANY(t.\"projectsContributed\");"
]

User Input: (plural is missed in the question, user might make grammar mistakes)
"How many focus area are in directory"
Generated SQL:
[
  "SELECT COUNT(*) FROM \"FocusArea\";"
]

User Input:
"List entities in public goods" (Could refer to teams or projects under focus area "Public Goods")

Generated SQL:
[
  "SELECT t.* FROM \"Team\" t JOIN \"FocusArea\" f ON t.name = ANY(f.teams) WHERE f.name ILIKE '%public goods%';",
  "SELECT p.* FROM \"Projects\" p JOIN \"FocusArea\" f ON p.name = ANY(f.projects) WHERE f.name ILIKE '%public goods%';"
]
User Input:
"List projects looking for funding"

Generated SQL:
[
  "SELECT * FROM \"Projects\" WHERE \"lookingForFunding\" = TRUE;"
]
User Input:
"Find teams under focus area 'AI Research'"

Generated SQL:
[
  "SELECT t.* FROM \"Team\" t JOIN \"FocusArea\" f ON t.name = ANY(f.teams) WHERE f.name ILIKE '%ai research%';"
]
User Input:
"Show members who contributed to projects under 'healthtech'"
Generated SQL:

[
  "SELECT DISTINCT m.* FROM \"Member\" m JOIN \"FocusArea\" f ON EXISTS (SELECT 1 FROM unnest(m.\"projectsContributed\") p WHERE p = ANY(f.projects)) WHERE f.name ILIKE '%healthtech%';"
]

User Input:
"Find events in Web3" (No "events" in schema → No valid query)

Generated SQL:
[]

`;

export const aiPromptTemplate = `For the given question "{{question}}", using only the provided 'Context' and 'Chat History Summary' (if available), generate a JSON response following this exact structure:

{
  "content": string,   // Summary of 'context'
  "sources": string[], // Array of unique source URLs from 'context'
  "followUpQuestions": string[], // Exactly 3 relevant questions based on 'context'
  "actions": object[]  // Array of action objects from action list
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
- **Strictly** Never add the 'followUpQuestions' in the 'content'.
- **Strictly** Never add the 'actions' in the 'content'

2. 'sources' FORMATTING:
- Include only unique, valid URLs f rom context
- Remove duplicates and invalid sources
- Return empty array if no sources available
- Sources must be ordered based on first appearance in content

4. 'followUpQuestions' FORMATTING:
- Must provide exactly 3 questions
- Questions must be directly related to provided context
- Each question should explore different aspects

5. 'actions' FORMATTING:
- Choose the best and appropriate 'action' item from the 'action list'
- Maximum 6 items from provided action list
- Each action must follow structure:
  {
    "name": string,
    "directoryLink": string,
    "type": "Member" | "Team" | "Project"
  }
- Deprioritize items with role "Contributor"
- Return empty array if no relevant actions available

Context: {{context}}
Chat Conversation Summary: {{chatSummary}}
action list: {{allDocs}};

`;

export const aiPromptTemplateForNonDirectory = `For the given question "{{question}}", using only the provided 'Context' and 'Chat History Summary' (if available), generate a JSON response following this exact structure:

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

`;

export const rephraseQuestionTemplate = `Given the chat summary - {{chatHistory}} and the new question - {{question}}, Rephrase the new question if its missing any context. If its not missing any context, return the same question. If its a completely new context, return the new question as it is.`;

export const chatSummaryWithHistoryTemplate = `Given the summary of chat history - {{previousSummary}}, and the new conversation - {{currentConversation}}, Summarize all the system responses into one and also all user queries into one as short as possible but without losing any context or detail`;
export const chatSummaryTemplate = `Given that chat conversation - {{currentConversation}}, Summarize all the system responses into one and also all user queries into one as short as possible but without losing any context or detail`;

export const EMAIL_TEMPLATES: { [key: string]: string } = {
  EVENT_ADDED: 'EVENT_ADDED',
  HOST_SPEAKER_ADDED: 'HOST_SPEAKER_ADDED',
  IRL_UPDATES: 'IRL_UPDATE',
};

export const NOTIFICATION_CHANNEL: { [key: string]: string } = {
  EMAIL: 'EMAIL',
  TELEGRAM: 'TELEGRAM',
};

export const CREATE = 'CREATE';
export const UPDATE = 'UPDATE';

export const EventInvitationToMember = 'EventInvitationToMember';
