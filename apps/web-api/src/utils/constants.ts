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

export const IGNORED_URLS_FOR_CONCEALID = ['/v1/husky/chat/assistant', '/v1/husky/chat/feedback'];
export const HUSKY_SOURCES = {
  TWITTER: 'twitter',
  WEB: 'web',
  ALL: 'all',
};

export const HUSKY_ACTION_TYPES = {
  TEAM: 'team',
  PROJECT: 'project',
  MEMBER: 'member',
  FOCUS_AREA: 'focus_area'
};

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

export const rephraseQuestionTemplate = `Given the chat summary - {{chatHistory}} and the new question - {{question}}, Rephrase the new question if its missing any context. If its not missing any context, return the same question. If its a completely new context, return the new question as it is.`;

export const chatSummaryWithHistoryTemplate = `Given the summary of chat history - {{previousSummary}}, and the new conversation - {{currentConversation}}, Summarize all the system responses into one and also all user queries into one as short as possible but without losing any context or detail`;
export const chatSummaryTemplate = `Given that chat conversation - {{currentConversation}}, Summarize all the system responses into one and also all user queries into one as short as possible but without losing any context or detail`;

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