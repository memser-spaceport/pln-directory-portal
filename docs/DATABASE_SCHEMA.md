# Protocol Labs Network Database Schema Documentation

## Core Entities

### Team
- Primary entity representing teams in the network
- Purpose: Manages team information, their focus areas, and relationships with members and projects
- Key fields:
  - Basic info: name, logo, website, blog, officeHours
  - Social: twitterHandler, linkedinHandler, telegramHandler
  - Descriptions: shortDescription, longDescription
  - Status: plnFriend, isFeatured
- Relationships:
  - Has many TeamMemberRoles (members)
  - Has many IndustryTags
  - Has many MembershipSources
  - Has one FundingStage
  - Has many Technologies
  - Can maintain or contribute to Projects
  - Has many TeamFocusAreas
  - Can have Asks

### Member
- Represents individual members in the network
- Purpose: Manages member profiles, their skills, roles, and interactions within the network
- Key fields:
  - Basic info: name, email, image
  - Social: githubHandler, discordHandler, twitterHandler, linkedinHandler, telegramHandler
  - Status: plnFriend, openToWork, isFeatured, isVerified
  - Preferences and details: bio, moreDetails, preferences
- Relationships:
  - Has many Skills
  - Has one Location
  - Has many TeamMemberRoles
  - Has many MemberRoles
  - Can contribute to Projects
  - Can create Projects
  - Can participate in Events
  - Can have Interactions with other members
  - Can have FollowUps and Feedbacks
  - Can create and modify DiscoveryQuestions
  - Can have Subscriptions
  - Can have Experiences

### Project
- Represents projects in the network
- Purpose: Tracks project information, their teams, and contributions
- Key fields:
  - Basic info: name, tagline, description, logo
  - Status: lookingForFunding, isFeatured, isDeleted
  - Details: projectLinks, kpis, readMe, score
- Relationships:
  - Has one Creator (Member)
  - Has one MaintainingTeam
  - Has many ContributingTeams
  - Has many ProjectFocusAreas
  - Has many ProjectContributions
  - Can have Asks

## Supporting Entities

### Focus Areas and Hierarchies
- FocusArea: Represents areas of focus with hierarchical relationships
  - Purpose: Organizes and categorizes teams and projects by their focus areas
  - Supports hierarchical relationships (parent-child)
  - Can be associated with both teams and projects

- TeamFocusArea: Links teams to their focus areas
  - Purpose: Maps teams to their specific focus areas
  - Includes ancestor area information for hierarchical tracking

- ProjectFocusArea: Links projects to their focus areas
  - Purpose: Maps projects to their specific focus areas
  - Includes ancestor area information for hierarchical tracking

- FocusAreaHierarchy: Manages hierarchical relationships between focus areas
  - Purpose: Maintains the parent-child relationships between focus areas
  - Key Fields:
    - isDirect: Whether this is a direct parent-child relationship
    - focusAreaUid: Parent focus area
    - subFocusAreaUid: Child focus area
  - Relationships:
    - Links to two FocusArea records (parent and child)
  - Enables efficient traversal of the focus area hierarchy

### Events and Locations

#### PLEventLocation
- Purpose: Represents physical or virtual locations for events
- Key Fields:
  - Basic Info:
    - location: Name/description of the location
    - timezone: Timezone of the location
    - latitude/longitude: Geographic coordinates (optional)
  - Visual Elements:
    - flag: Country/region flag identifier
    - icon: Location icon identifier
  - Additional Data:
    - resources: Array of JSON resources (e.g., maps, directions)
    - additionalInfo: Optional JSON for extra location details
  - Status:
    - isFeatured: Whether the location is featured
    - isAggregated: Whether the location is an aggregate of multiple locations
  - Priority: Integer for sorting/ordering locations
- Relationships:
  - Has many PLEvents (one-to-many)

#### PLEvent
- Purpose: Represents events in the Protocol Labs Network
- Key Fields:
  - Basic Info:
    - name: Event name
    - description: Full event description
    - shortDescription: Brief event description
    - websiteURL: Event website
    - slugURL: URL-friendly unique identifier
  - Timing:
    - startDate: Event start date/time
    - endDate: Event end date/time
    - syncedAt: Last synchronization timestamp
  - Visual Elements:
    - logo: Event logo (Image relation)
    - banner: Event banner (Image relation)
  - External Integration:
    - telegramId: Telegram channel/group ID
    - externalId: External system identifier
  - Content:
    - resources: Array of JSON resources
    - additionalInfo: Optional JSON for extra event details
  - Status:
    - type: PLEventType (e.g., INVITE_ONLY)
    - isFeatured: Whether the event is featured
    - isAggregated: Whether the event is an aggregate
  - Metrics:
    - eventsCount: Number of related events
    - priority: Integer for sorting/ordering
- Relationships:
  - Has one PLEventLocation (optional)
  - Has many PLEventGuests (one-to-many)
  - Has many DiscoveryQuestions (many-to-many)
  - Has two Image relations (logo and banner)

#### PLEventGuest
- Purpose: Manages event participation and roles
- Key Fields:
  - Basic Info:
    - telegramId: Telegram user ID
    - officeHours: Office hours information
    - reason: Reason for participation
  - Role Flags:
    - isHost: Whether the guest is a host
    - isSpeaker: Whether the guest is a speaker
    - isSponsor: Whether the guest is a sponsor
    - isFeatured: Whether the guest is featured
  - Content:
    - topics: Array of topics the guest will cover
    - additionalInfo: Optional JSON for extra guest details
  - Priority: Integer for sorting/ordering guests
- Relationships:
  - Belongs to one Member (required)
  - Belongs to one Team (optional)
  - Belongs to one PLEvent (required)
- Cascade Deletion:
  - Deletes when associated Member is deleted
  - Deletes when associated Team is deleted
  - Deletes when associated Event is deleted

#### Event Participation Flow
1. Event Creation:
   - Create PLEvent with basic information
   - Optionally associate with PLEventLocation
   - Add visual elements (logo, banner)

2. Guest Management:
   - Add PLEventGuests for participants
   - Assign roles (host, speaker, sponsor)
   - Set topics and additional information

3. Event Features:
   - Support for both physical and virtual events
   - Integration with Telegram
   - Resource management
   - Priority-based ordering
   - Featured content highlighting

4. Member and Team Association:
   - Members can participate directly
   - Teams can participate as entities
   - Support for multiple roles per participant
   - Tracking of participation history

### Member Interactions
- MemberInteraction: Tracks interactions between members
  - Purpose: Records and manages interactions between network members
  - Supports relationship building and networking

- MemberFollowUp: Manages follow-up actions
  - Purpose: Tracks follow-up tasks and their status
  - Supports relationship maintenance and engagement

- MemberFeedback: Stores feedback from members
  - Purpose: Collects and manages member feedback
  - Includes response type and detailed feedback

- MemberSubscription: Manages member subscriptions
  - Purpose: Handles member subscriptions to various entities
  - Supports notification preferences

- MemberExperience: Tracks member experiences
  - Purpose: Records member's professional and network experiences
  - Supports member profile enrichment

### Content and Discovery
- DiscoveryQuestion: Questions for discovery and engagement
  - Purpose: Facilitates member and team discovery
  - Supports different question types (CHAT, FOLLOW_UP)
  - Can be related to teams, projects, or events

- Ask: Represents requests or needs from teams/projects
  - Purpose: Manages requests and needs within the network
  - Tracks status and resolution of asks
  - Can be associated with teams or projects

- Image: Manages images with different sizes and versions
  - Purpose: Handles image storage and versioning
  - Supports multiple sizes for different use cases
  - Includes metadata and relationships

### Categorization and Classification

#### Industry Related
- IndustryCategory: Categories for industries
  - Purpose: Provides top-level industry categorization
  - Organizes industry tags into logical groups

- IndustryTag: Tags for industries
  - Purpose: Detailed industry classification
  - Links to industry categories
  - Associated with teams
  - Example Tags:
    - NFT
    - Developer Tooling
    - Software Development
    - Social
    - R&D
    - Consumer
    - DeFi
    - Education
    - Verifiable Storage & Privacy
    - Data Tooling
    - DAO Tooling
    - Security
    - Collaboration
    - Data Science and Analytics
    - Metaverse
    - Gaming
    - Data Markets
    - Video app & storage
    - Decentralized Identity
    - Startup Funding & Development
    - Ecosystem Growth
    - Reputation Systems
    - Creative Services
    - AI
    - Branding and Design
    - VR/AR
    - Events
    - Consultancy
    - Music app & storage
    - CDN
    - Hardware
    - Privacy
    - Wallet
    - Trust & Safety
    - BioTech
    - Treasury management
    - Photo
    - Cryptography
    - Messaging
    - Website
    - Payments
    - Exchange
    - Content Moderation
    - Discontinued
    - Hosting
    - Search
    - Video Conferencing
    - HR
    - Merch

#### Technology and Skills
- Technology: Technologies used by teams
  - Purpose: Tracks technologies used by teams
  - Supports technology discovery and matching
  - Example Technologies:
    - Filecoin
    - IPFS
    - libp2p
    - IPLD
    - drand
    - FVM
    - SourceCred

- Skill: Skills possessed by members
  - Purpose: Records member skills and expertise
  - Supports skill-based matching and discovery
  - Example Skills:
    - AI
    - Cryptoeconomics
    - Education
    - Engineering
    - Finance
    - Fundraising
    - Legal
    - Management
    - Marketing & Creative
    - Operations
    - People
    - Product
    - Recruiting
    - Research
    - Strategy
    - Tax

#### Membership and Funding
- FundingStage: Stages of funding
  - Purpose: Tracks team funding status
  - Supports investment and funding discovery
  - Example Stages:
    - Pre-seed
    - Seed
    - Series A
    - Series B
    - Series C
    - Series D

- MembershipSource: Sources of membership
  - Purpose: Records how teams joined the network
  - Supports membership analytics and tracking
  - Example Sources:
    - Cypher
    - Faber
    - Longhash
    - Outlier Ventures
    - Tachyon
    - Y Combinator

### Additional Entities

#### Team Member Roles
- TeamMemberRole: Links members to teams with roles
  - Purpose: Manages member-team relationships
  - Includes role information and dates
  - Tracks team leadership status

#### Member Roles
- MemberRole: Defines roles within the network
  - Purpose: Categorizes members by their network roles
  - Supports role-based permissions and features
  - Example Roles:
    - DIRECTORYADMIN (Administrator with full access to the directory)

#### Location
- Location: Geographic information
  - Purpose: Stores detailed location data
  - Includes city, country, region, and coordinates
  - Supports location-based features

#### Notifications
- Notification: System notifications
  - Purpose: Manages user notifications
  - Tracks notification status and delivery
  - Key Fields:
    - entityUid: Unique identifier of the entity that triggered the notification
    - entityAction: The action that triggered the notification
    - entityType: Type of entity (e.g., EVENT_LOCATION)
    - status: Current status of the notification (PENDING, SENT, FAILED)
    - additionalInfo: Optional JSON data with additional notification details
  - Status Types:
    - PENDING: Notification is queued for delivery
    - SENT: Notification has been successfully delivered
    - FAILED: Notification delivery failed
  - Entity Types:
    - EVENT_LOCATION: Notifications related to event locations
  - Usage:
    - Tracks delivery status of system notifications
    - Supports different types of entity notifications
    - Allows for additional metadata through JSON field
    - Maintains audit trail with creation and update timestamps

#### Join Requests
- JoinRequest: Network join requests
  - Purpose: Manages requests to join the network
  - Includes introduction and contact information

#### FAQs
- Faq: Frequently asked questions
  - Purpose: Stores user questions and support requests
  - Tracks question type and status

### Image Management
- Image: Manages dynamic image assets in the system like pfps
  - Purpose: Handles image storage, versioning, and relationships
  - Key Fields:
    - Basic Info:
      - cid: Content identifier for the image
      - width/height: Image dimensions
      - url: Image URL
      - filename: Original filename
      - size: File size
      - type: File type
    - Versioning:
      - version: ImageSize enum (ORIGINAL, LARGE, MEDIUM, SMALL, TINY)
      - thumbnailToUid: Reference to parent image
    - Relationships:
      - Has many thumbnails (self-referential)
      - Used by Teams, Members, Projects, and Events

### Project Contributions
- ProjectContribution: Tracks member contributions to projects
  - Purpose: Records member involvement in projects
  - Key Fields:
    - role: Contribution role
    - description: Contribution details
    - currentProject: Whether this is an active contribution
    - startDate/endDate: Contribution period
  - Relationships:
    - Belongs to one Member
    - Belongs to one Project
    - Unique constraint on [memberUid, projectUid]

### Focus Area Version History
- TeamFocusAreaVersionHistory: Tracks changes to team focus areas
  - Purpose: Maintains audit trail of focus area modifications
  - Key Fields:
    - teamName: Name of the team at time of change
    - focusAreaTitle: Title of the focus area
    - modifiedBy: Member who made the change
    - username: Name of the modifier
    - version: Version number
  - Relationships:
    - Belongs to one Team
    - Belongs to one FocusArea (optional)
    - Belongs to one Member (modifier)
  - Unique constraint on [focusAreaUid, teamUid, version]

### Participant Requests
- ParticipantsRequest: Manages requests to add/edit participants which include member/team. Edit requests are auto approved
  - Purpose: Handles participant registration and approval
  - Key Fields:
    - type: Type of participant (MEMBER, TEAM)
    - status: Approval status
    - data: Additional request information
  - Relationships:
    - Can be associated with Members or Teams
    - Tracks approval workflow

## Enums

- AskStatus: OPEN, CLOSED
  - Purpose: Tracks the status of asks in the network

- ParticipantType: MEMBER, TEAM
  - Purpose: Distinguishes between member and team participation

- ApprovalStatus: PENDING, APPROVED, REJECTED, AUTOAPPROVED
  - Purpose: Manages approval workflows

- PLEventType: INVITE_ONLY
  - Purpose: Defines event access types

- MemberFollowUpStatus: PENDING, COMPLETED, CLOSED
  - Purpose: Tracks follow-up task status

- MemberFeedbackResponseType: POSITIVE, NEGATIVE, NEUTRAL
  - Purpose: Categorizes feedback responses

- ImageSize: ORIGINAL, LARGE, MEDIUM, SMALL, TINY
  - Purpose: Defines available image sizes

- DiscoveryQuestionType: CHAT, FOLLOW_UP
  - Purpose: Categorizes discovery questions

- NotificationStatus: (defined in schema)
  - Purpose: Tracks notification delivery status

- SubscriptionEntityType: (defined in schema)
  - Purpose: Defines types of subscribable entities

## Key Relationships

1. Team-Member Relationship:
   - Many-to-many through TeamMemberRole
   - Includes role information and dates
   - Supports team leadership tracking

2. Project Relationships:
   - One-to-many with Creator (Member)
   - One-to-many with MaintainingTeam
   - Many-to-many with ContributingTeams
   - Many-to-many with Members through ProjectContribution

3. Focus Area Hierarchy:
   - Self-referential relationships in FocusArea
   - Many-to-many relationships with Teams and Projects
   - Supports hierarchical organization

4. Event Participation:
   - Many-to-many relationships between Events and Members/Teams
   - Includes role information (host, speaker, sponsor)
   - Supports event management and tracking

5. Member Interactions:
   - Complex network of interactions, follow-ups, and feedback
   - Subscription system for notifications
   - Supports relationship building and maintenance

## Notes

- All entities include standard fields: id, uid, createdAt, updatedAt
- Most relationships use uid as the foreign key
- Cascade deletion is implemented for critical relationships
- Many entities include soft deletion capabilities
- The schema supports a rich ecosystem of member and team interactions
- Relationships are optimized for efficient querying and data integrity
- The schema supports extensibility through additional fields and relationships 