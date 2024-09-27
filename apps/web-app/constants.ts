export const URL_QUERY_VALUE_SEPARATOR = '|';
export const ITEMS_PER_PAGE = 9;
export const FATHOM_EVENTS = {
  portal: {
    nav: {
      directory: 'BH9JTCGQ',
      discord: 'AB3MXZZH',
      labWeek22: '0KJJ2EUT',
      launchpad: 'JJPYTSPL',
      mosaia: 'GU0B5FOF',
      events: 'N93YFAXP',
      ideashub: '4EVLSAXF',
    },
    networkDirectory: '7M1Q65KH',
    labWeek22: {
      filLisbon: 'G15I8LA8',
      ipfsCamp: 'LRSFUMVF',
      plSummit: 'JBWFNMIA',
      fullSchedule: 'SNBZOIDH',
    },
    substack: {
      learnMore: 'GEVI7BWS',
      subscribe: '1FN6R9HS',
    },
    mosaia: {
      learnMore: '3UPXXTY6',
    },
    launchpad: {
      learnMore: '1MIVOPAO',
    },
    faq: {
      whatIsPl: '32IWWVRI',
      plAndPln: 'RPTUCVFK',
      howToJoin: 'DJ8R1BOQ',
    },
  },
  directory: {
    controls: {
      viewTypeListToGrid: 'BFUWBQXV',
      viewTypeGridToList: 'L5UM9LWA',
    },
    joinNetwork: 'HUGDIQDP',
    joinNetworkAsMember: 'KJLW2EYZ',
    joinNetworkAsMemberSave: 'IO16NLIO',
    joinNetworkAsTeam: 'GWGBBAHB',
    joinNetworkAsTeamSave: '2PK35OAO',
    loginAsUser: 'ZUADLQRM',
    logout: 'BV1DRX0M',
    settings: 'DTOAIRCK',
    settingCategory: {
      profile: 'WSSLPD6W',
      member: 'XO85CR3A',
      team: '2DSHVFY4',
    },
  },
  members: {
    directory: {
      filters: {
        officeHoursOnly: 'FQZFKGB0',
        includeFriends: '1LNSORWL',
        skills: 'OB2SCUQK',
        region: '9DFPHYUF',
        country: 'EMEZBS7G',
        metroArea: 'O1I7TF4M',
        openToWork: 'USG99P5G',
      },
      controls: {
        searchBy: '8BWPXHVB',
        sort: 'WOZNMS0E',
        viewType: 'ZZYU8VJV',
        viewTypeListToGrid: 'PZUNLXST',
        viewTypeGridToList: 'QUCCIPTW',
      },
    },
    profile: {
      requestToEdit: 'RI7BOPLV',
      editSave: 'MO5HZEUS',
      officeHours: {
        scheduleMeeting: 'EKX8QTJD',
        learnMore: 'QWTLEVVB',
      },
      gitHub: {
        seeAll: '6XTZM7BA',
        projectItem: 'VBMVUVWX',
      },
    },
  },
  teams: {
    directory: {
      filters: {
        includeFriends: '2SQSL0FQ',
        tags: 'BSOPLO3Z',
        membershipSources: 'LWE6VIGX',
        fundingStage: 'L4SN5SWW',
        technology: 'QSLCUGEX',
      },
      controls: {
        searchBy: 'E5KGF8SF',
        sort: 'R0U6VIQR',
        viewType: '9E11MZ5Q',
        viewTypeListToGrid: 'KHBW7DAV',
        viewTypeGridToList: 'RPBE1AWN',
      },
    },
    profile: {
      requestToEdit: 'GHBT5VFH',
      editSave: 'GZ6LFEDJ',
    },
  },
  projects: {
    directory: {
      controls: {
        viewType: '9E11MZ5Q',
        viewTypeListToGrid: 'KHBW7DAV',
        viewTypeGridToList: 'RPBE1AWN',
      },
    },
  },
};
export const AIRTABLE_REGEX = /^rec[A-Za-z0-9]{14}$/;
export const LINKEDIN_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|profile|company)\/([a-zA-Z0-9-_]+)/;
export const TWITTER_URL_REGEX = /twitter\.com\/([^/]+)/;
export const GITHUB_URL_REGEX = /github\.com\/([^/]+)/;
export const TELEGRAM_URL_REGEX = /t\.me\/([^/]+)/;

export const ENROLLMENT_TYPE = {
  MEMBER: 'MEMBER',
  TEAM: 'TEAM',
};

export const LOGIN_MSG = 'Your account has been verified';
export const LOGIN_FAILED_MSG = 'Login attempt failed.Please try again';
export const LOGOUT_MSG = 'You have been logged out successfully';
export const RETRY_LOGIN_MSG = 'Please login and try again';
export const LOGGED_IN_MSG = 'You are already logged in';
export const SOMETHING_WENT_WRONG = 'Something went wrong. Please try again';
export const EMAIL_CHANGED = 'Email has been changed successfully';
export const SCHEDULE_MEETING_MSG = 'Please proceed to schedule a meeting';
export const FORBIDDEN_ERR_MSG = 'You are not allowed to do this';
export const BAD_REQUEST_ERR_MSG = 'Bad Request';
export const NETWORK_ERR_MSG = 'Network error. please try again';
export const OFFICE_HOURS_MSG =
  'Schedule a one on one office hours discussion with';
export const TEAM_OFFICE_HOURS_MSG =
  'Join office hours discussion with';

export const PAGE_ROUTES = {
  MEMBERS: '/members',
  TEAMS: '/teams',
  SETTINGS: '/settings',
  PROJECTS: '/projects',
};

export const SETTINGS_CONSTANTS = {
  PROFILE_SETTINGS: 'Profile',
  TEAM_SETTINGS: 'Manage Teams',
  MEMBER_SETTINGS: 'Manage Members',
  PRIVACY: 'Privacy',
  ACCOUNT_SETTINGS: 'PREFERENCES',
  TEAM: 'team',
  MEMBER: 'member',
  CONF_TITLE: 'Discard Changes',
  TEAM_HELP_TXT:
    'Please update only the fields that you would like to change for this team',
  ADMIN_SETTINGS: 'ADMIN SETTINGS',
  VIEW_PREFERNCES: 'View user preferences',
  USER_PREF: 'User Preferences',
};

export const APP_ANALYTICS_EVENTS = {
  HOME_LABWEEK_WEBSITE_LINK_CLICKED: 'home_labweek_website_link_clicked',
  HOME_LABWEEK_SCHEDULE_LINK_CLICKED: 'home_labweek_schedule_link_clicked',

  NAVBAR_MENU_ITEM_CLICKED: 'navbar-menu-item-clicked',
  NAVBAR_ACCOUNTMENU_ITEM_CLICKED: 'navbar-accountmenu-item-clicked',
  NAVBAR_GET_HELP_ITEM_CLICKED: 'navbar-get-help-item-clicked',

  MEMBER_OFFICEHOURS_CLICKED: 'member-officehours-clicked',
  MEMBER_CLICKED: 'member-clicked',
  MEMBER_JOIN_NETWORK_FORM_STEPS: 'member-join-network-form-steps',
  MEMBER_GITHUB_PROJECT_VIEW_ALL_CLICKED:
    'member-github-project-view-all-clicked',
  MEMBER_GITHUB_PROJECT_ITEM_CLICKED: 'member-github-project-view-item-clicked',
  MEMBER_EDIT_BY_SELF: 'member-edit-by-self',
  MEMBER_EDIT_BY_ADMIN: 'member-edit-by-admin',

  USER_VERIFICATION_INIT: 'user-verification-init',
  USER_VERIFICATION_SEND_OTP: 'user-verification-sendotp',
  USER_VERIFICATION_RESEND_OTP: 'user-verification-resendotp',
  USER_VERIFICATION_VERIFY_OTP: 'user-verification-verifyotp',
  USER_VERIFICATION_SUCCESS: 'user-verification-success',

  SETTINGS_USER_CHANGE_EMAIL_CLICKED: 'settings-user-change-email-clicked',
  SETTINGS_USER_CHANGE_EMAIL_CANCELLED: 'settings-user-change-email-cancelled',
  SETTINGS_USER_CHANGE_EMAIL_SEND_OTP: 'settings-user-change-email-sendotp',
  SETTINGS_USER_CHANGE_EMAIL_RESEND_OTP: 'settings-user-change-email-resendotp',
  SETTINGS_USER_CHANGE_EMAIL_VERIFY_OTP: 'settings-user-change-email-verifyotp',
  SETTINGS_USER_CHANGE_EMAIL_SUCCESS: 'settings-user-change-email-success',
  SETTINGS_MEMBER_CHANGE_EMAIL_CLICKED: 'settings-member-change-email-clicked',
  SETTINGS_MEMBER_CHANGE_EMAIL_CANCELLED:
    'settings-member-change-email-cancelled',
  SETTINGS_MEMBER_CHANGE_EMAIL_SUCCESS: 'settings-member-change-email-success',

  SETTINGS_USER_PROFILE_EDIT_FORM: 'settings-user-profile-edit-form',
  SETTINGS_MEMBER_PROFILE_EDIT_FORM: 'settings-member-profile-edit-form',
  SETTINGS_TEAM_PROFILE_EDIT_FORM: 'settings-team-profile-edit-form',

  SETTINGS_USER_PREFERENCES: 'settings-user-preferences',
  SETTINGS_USER_PREFERENCES_RESET: 'settings-user-reset',

  TEAM_CLICKED: 'team-clicked',
  TEAM_JOIN_NETWORK_FORM_STEPS: 'team-join-network-form-steps',
  TEAM_EDIT_BY_LEAD: 'team-edit-by-lead',
  TEAM_EDIT_BY_ADMIN: 'team-edit-by-admin',
  TEAM_FOCUS_AREA_HELP_CLICKED: 'team-filter-focus-area-help-clicked',
  TEAM_OFFICE_HOURS_FILTER_SELECTED: 'team-office-hours-filter-selected',
  TEAM_OFFICEHOURS_CLICKED: 'team-officehours-clicked',
  TEAM_OFFICEHOURS_LOGIN_BTN_CLICKED: 'team-officehours-login-btn-clicked',
  TEAM_OFFICEHOURS_LEARN_MORE_CLICKED: 'team-officehours-learn-more-clicked',

  PR_CONRTIBUTIONS_LIST_ITEM_ADD: 'pr-contributions-list-item-add',
  PR_CONRTIBUTIONS_LIST_ITEM_DELETE: 'pr-contributions-list-item-delete',
  PR_CONRTIBUTIONS_LIST_ITEM_ADDPROJECT:
    'pr-contributions-list-item-addproject',
  MEMBER_PR_CONTRIBUTIONS_ADD: 'member-pr-contributions-add',
  MEMBER_PR_CONTRIBUTIONS_EDIT: 'member-pr-contributions-add',
  MEMBER_PR_CONTRIBUTIONS_SHOWMORE: 'member-pr-contributions-showmore',
  MEMBER_PR_CONTRIBUTIONS_SHOWLESS: 'member-pr-contributions-showless',

  FILTERS_APPLIED: 'filters-applied',
  MEMBER_ROLE_FILTER_SEARCH_CALLED: 'member-role-filter-search-called',
  MEMBER_ROLE_FILTER_SELECT_ALL: 'member-role-filter-select-all',
  MEMBER_ROLE_FILTER_SEARCH_ERROR: 'member-role-filter-search-error',

  PROJECTS_FILTERS_APPLIED: 'projects-filters-applied',
  PROJECTS_FILTERS_CLEARED: 'projects-filters-cleared',
  PROJECT_CLICKED: 'project-clicked',
  PROJECT_DETAIL_SEEALL_CLICKED: 'project-detail-teams-seeall-clicked',
  PROJECT_DETAIL_MAINTAINER_TEAM_CLICKED:
    'project-detail-maintainer-team-clicked',
  PROJECT_DETAIL_CONTRIBUTING_TEAM_CLICKED:
    'project-detail-contributing-team-clicked',
  PROJECT_DETAIL_LINKS_CLICKED: 'project-detail-link-clicked',
  PROJECT_DETAIL_EDIT_CLICKED: 'project-detail-edit-clicked',
  PROJECT_DETAIL_DELETE_CLICKED: 'project-detail-delete-clicked',
  PROJECT_DETAIL_DELETE_YES_CLICKED: 'project-detail-delete-clicked-confirmed',
  PROJECT_DETAIL_DELETE_NO_CLICKED: 'project-detail-delete-clicked-canceled',
  PROJECT_DETAIL_DELETE_SUCCESS: 'project-detail-delete-success',
  PROJECT_DETAIL_DELETE_FAILED: 'project-detail-delete-failed',
  PROJECT_EDIT_CLICKED: 'project-edit-clicked',
  PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_CANCELLED:
    'project-detail-additional-detail-edit-cancelled',
  PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_SAVE:
    'project-detail-additional-detail-edit-save-clicked',
  PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_SAVE_SUCCESS:
    'project-detail-additional-detail-edit-save-success',
  PROJECT_DETAIL_ADDITIONAL_DETAIL_EDIT_SAVE_FAILED:
    'project-detail-additional-detail-edit-save-failed',
  PROJECT_EDIT_CANCEL: 'project-edit-cancel-clicked',
  PROJECT_ADD_CANCEL: 'project-add-cancel-clicked',
  PROJECT_ADD_SAVE_CLICKED: 'project-add-save-clicked',
  PROJECT_EDIT_SAVE_CLICKED: 'project-edit-save-clicked',
  PROJECT_EDIT_SAVE_VALIDATION_SUCCESS: 'project-edit-save-validation-success',
  PROJECT_ADD_SAVE_VALIDATION_SUCCESS: 'project-add-save-validation-success',
  PROJECT_EDIT_SAVE_VALIDATION_FAILED: 'project-edit-save-validation-failed',
  PROJECT_ADD_SAVE_VALIDATION_FAILED: 'project-add-save-validation-failed',
  PROJECT_ADD_SAVE_SUCESS: 'project-add-save-success',
  PROJECT_ADD_SAVE_FAIL: 'project-add-save-fail',
  PROJECT_EDIT_SAVE_SUCESS: 'project-edit-save-success',
  PROJECT_EDIT_SAVE_FAIL: 'project-edit-save-fail',
  PROJECT_ADD_CLICKED: 'project-add-click',
  TEAMS_DETAIL_PROJECTS_SEE_ALL: 'team-detail-projects-see-all-clicked',

  DIRECTORY_LIST_SORTBY_CHANGED: 'directory-list-sortby-changed',

  IRL_GATHERING_CARD_CLICKED: 'irl_gathering_card_clicked',

  IRL_INVITE_ONLY_RESTRICTION_POPUP_LOGIN_CLICKED: 'irl_invite_only_restriction_popup_login_clicked',

  IRL_NAVBAR_BACK_BTN_CLICKED:"irl-navbar-back-btn-clicked",
  IRL_GUEST_LIST_TELEGRAM_BTN_CLICKED:'irl-guest-list-telegram-btn-clicked',
  IRL_BANNER_VIEW_SCHEDULE_BTN_CLICKED:"irl-banner-view-schedule-btn-clicked",
  IRL_BANNER_ADD_EVENT_BTN_CLICKED:"irl-banner-add-event-btn-clicked",
  IRL_RESOURCE_CLICKED:'irl-resource-clicked',
  IRL_RESOURCES_LOGIN_BTN_CLICKED:"irl-resources-login-btn-clicked",
  IRL_RESOURCE_POPUP_RESOURCE_LINK_CLICKED:"irl-banner-resource-popup-resource-link-clicked",
  IRL_RESOURCE_POPUP_LOGIN_CLICKED:"irl-resource-popup-login-clicked",
  IRL_RESOURCES_SEE_MORE_CLICKED:"irl-resources-see-more-clicked",
  IRL_JOIN_EVENT_STRIP_LOGIN_BTN_CLICKED:"irl-join-event-strip-login-btn-clicked",
  IRL_JOIN_EVENT_STRIP_IAM_GOING_BTN_CLICKED:"irl-join-event-strip-iam-going-btn-clicked",
  IRL_INFO_STRIP_JOIN_BTN_CLICKED:'irl-info-strip-join-btn-clicked',
  IRL_GUEST_LIST_LOGIN_BTN_CLICKED:'irl-guest-list-login-btn-clicked',
  IRL_GUEST_LIST_IAM_GOING_BTN_CLICKED:"irl-guest-list-iam-going-btn-clicked",
  IRL_EDIT_RESPONSE_BTN_CLICKED:"irl-edit-response-btn-clicked",
  IRL_GUEST_LIST_SEARCH:'irl-guest-list-search',
  IRL_GUEST_LIST_TABLE_SORT_CLICKED:"irl-guest-list-table-sort-clicked",
  IRL_GUEST_LIST_TABLE_FILTER_BTN_CLICKED:"irl-guest-list-table-filter-btn-clicked",
  IRL_GUEST_LIST_TABLE_FILTER_APPLY_BTN_CLICKED:"irl-guest-list-table-filter-apply-btn-clicked",
  IRL_GUEST_LIST_TABLE_LOGIN_BTN_CLICKED:"irl-guest-list-table-login-btn-clicked",
  IRL_GUEST_LIST_TABLE_TEAM_CLICKED:"irl-guest-list-table-team-clicked",
  IRL_GUEST_LIST_TABLE_MEMBER_CLICKED:"irl-guest-list-table-member-clicked",
  IRL_GUEST_LIST_TABLE_TELEGRAM_LINK_CLICKED:'irl-guest-list-table-telegram-link-clicked',
  IRL_GUEST_LIST_TABLE_OFFICE_HOURS_LINK_CLICKED:'irl-guest-list-table-office-hours-link-clicked',
  IRL_GUEST_LIST_TABLE_ADD_OFFICE_HOURS_CLICKED:'irl-guest-list-table-add-office-hours-clicked',
  IRL_RSVP_POPUP_SAVE_BTN_CLICKED:'irl-rsvp-popup-save-btn-clicked',
  IRL_RSVP_POPUP_UPDATE_BTN_CLICKED:'irl-rsvp-popup-update-btn-clicked',
  IRL_RSVP_POPUP_OH_GUIDELINE_URL_CLICKED: 'irl-rsvp-popup-oh-guideline-url-clicked',
  IRL_RSVP_POPUP_PRIVACY_SETTING_LINK_CLICKED: 'irl-rsvp-popup-privacy-setting-link-clicked',

  GO_TO_TOP_BTN_CLICKED:"go-to-top-btn-clicked",
  SELECT_FOCUS_AREA_BTN_CLICKED:'select-focus-area-btn-clicked',
  FOCUS_AREA_POPUP_SAVE_BTN_CLICKED:'focus-area-popup-save-btn-clicked',
  FOCUS_AREA_EDIT_BTN_CLICKED:'focus-area-edit-btn-clicked',
};

export const TAB_CONSTANTS = {
  BASIC: 'BASIC',
  SKILLS: 'SKILLS',
  SOCIAL: 'SOCIAL',
  PROJECT_DETAILS: 'PROJECT DETAILS',
};

export const MSG_CONSTANTS = {
  TEAM_UPDATE_MESSAGE: 'Successfully Saved',
  MEMBER_UPDATE_MESSAGE: 'Successfully Saved',
  CHANGE_CONF_MSG: 'Do you want to discard the changes before you proceed ?',
  RESET_CHANGE_CONF_MSG: 'Do you want to reset the changes ?',
  NO_CHANGES_TO_RESET: 'No changes made to reset',
  NO_CHANGES_TO_SAVE: 'No changes made to save',
  GIT_HANDLE_DISABLE_ALERT_DESC:
    'Hiding GitHub handle will automatically disable visibility of your projects. Do you wish to proceed?',
  GIT_HANDLE_DISABLE_ALERT_TITLE: 'GitHub - Privacy Settings',
};

export const BTN_LABEL_CONSTANTS = {
  RESET: 'Reset',
  READ_ARTICLE: 'Read Article',
  PLAY_VIDEO: 'Play Video',
  VIEW_PLAYLIST: 'View Playlist',
  YES: 'Yes',
  NO: 'No',
  SAVE: 'Save Changes',
  DISCARD: 'Discard',
};

export const NW_SPOTLIGHT_CONSTANTS = {
  HEADING: 'Network Spotlight',
  BLOG: 'Blog',
  BLOG_URL:
    'https://protocol.ai/blog/web3-trends-2023-top-3-exciting-projects-at-protocol-labs/',
  BLOG_TITLE: 'Web3 Trends 2023: 3 Exciting Projects at Protocol Labs',
  VIDEO: 'Video',
  VIDEO_URL:
    'https://www.googleapis.com/youtube/v3/videos?key=AIzaSyCvn2zMiYOTq83AC8WNLL8CcmbTl9Pl53c&part=snippet&id=r-nU_MI2lV4',
  SERIES: 'Series',
  PLAYLIST_URL:
    'https://youtube.googleapis.com/youtube/v3/playlists?part=snippet%2CcontentDetails%2Cstatus&id=PLxkRVyHG0CI8MzS7657PjygNxvCGmMm-Y&key=AIzaSyCvn2zMiYOTq83AC8WNLL8CcmbTl9Pl53c',
  YOUTUBE_PLAYLIST:
    'https://www.youtube.com/watch?v=4zIVSo935rs&list=PLxkRVyHG0CI8MzS7657PjygNxvCGmMm-Y',
};

export const ADMIN_ROLE = 'DIRECTORYADMIN';
export const EMAIL_OTP_CONSTANTS = {
  INITIAL_LOGIN: {
    sendEmailTitle: 'Verify Email',
    sendEmailDesc:
      "Please enter the membership email you used to create your directory profile. Don't remember? Contact support supportmail@protocol.ai",
    verifyOtpTitle: 'Enter Code',
    verifyOtpDesc: 'Please enter the code sent to',
  },
  CHANGE_EMAIL: {
    sendEmailTitle: 'Enter New Email',
    sendEmailDesc: '',
    verifyOtpTitle: 'Enter Code',
    verifyOtpDesc: 'Please enter the code sent to',
  },
};

const DEFAULT_PRIVACY_VISIBILITY = true;

export const PRIVACY_CONSTANTS = {
  CONTACT_DETAILS: 'Contact Details',
  SHOW_EMAIL: 'Show Email',
  EMAIL_HELP_TXT:
    'Enabling this will display your email to all logged in members ',
  SHOW_GITHUB: 'Show GitHub',
  GH_HELP_TXT:
    'Enabling this will display your GitHub handle to all logged in members',
  SHOW_TELEGRAM: 'Show Telegram',
  TELEGRAM_HELP_TXT:
    'Enabling this will display your Telegram handle to all logged in members',
  SHOW_LIN_PFL: 'Show LinkedIn Profile',
  LIN_HELP_TXT:
    'Enabling this will display your LinkedIn Profile link to all logged in members',
  SHOW_DISCORD: 'Show Discord',
  DISCORD_HLP_TXT:
    'Enabling this will display your Discord handle link to all logged in members',
  OPEN_TO_COLLABORATE: 'Open to collborate',
  OTC_HELP_TXT:
    'Enabling this will let the members know your collaboration logged in status',
  SHOW_TWITTER: 'Show Twitter',
  TWITTER_HELP_TXT:
    'Enabling this will display your Twitter Handle to all logged in members ',
  SHOW_GH_PJCTS: 'Show my GitHub Projects',
  GH_PJCTS_HELP_TXT: 'Control visibility of your GitHub projects',
  PROFILE: 'Profile',
  DEFAULT_SETTINGS: {
    showEmail: DEFAULT_PRIVACY_VISIBILITY,
    showGithubHandle: DEFAULT_PRIVACY_VISIBILITY,
    showTelegram: DEFAULT_PRIVACY_VISIBILITY,
    showLinkedin: DEFAULT_PRIVACY_VISIBILITY,
    showDiscord: DEFAULT_PRIVACY_VISIBILITY,
    showGithubProjects: DEFAULT_PRIVACY_VISIBILITY,
    showTwitter: DEFAULT_PRIVACY_VISIBILITY,
  },
};

export const ANNOUNCEMENT_BANNER = {
  VIEW_WEBSITE: 'View website',
  LEARN_MORE: 'Learn More',
};

export const ChangeLogList = [
  {
    title: 'Version 2.1.3 - Enhancements',
    tag: 'Improvements',
    date: '12, Jul 2024 ',
    shortContent: `<p style="font-size: 16px; line-height:24px;">
    Users can now find the Focus Area details on the Teams and Projects detail pages.
    </p>`,
  },
  {
    title: 'Version 2.1.2 - Enhancements',
    tag: 'Improvements',
    date: '05, Jul 2024 ',
    shortContent: `<p style="font-size: 16px; line-height:24px;">
    <span style="font-size: 16px">Feel free to connect with your fellow attendees at the events by</span><br/>
    <ul style="padding-left:32px ; margin-bottom:15px; font-size: 16px; list-style: disc;">
    <li>Scheduling Office Hours</li>
    <li>Connecting via Telegram</li>
    </ul>
    <span style="font-size: 16px;">Additionally, your Telegram Handles will be automatically displayed at the IRL events you attend, per the related Privacy Settings.</span>
    </p>`,
  },
  {
    title: 'Version 2.1.1 - Enhancements',
    tag: 'Improvements',
    date: '14, Jun 2024 ',
    shortContent: `<p style="font-size: 16px; line-height:24px;">
    We are excited to introduce office hours for teams. With this option, you can now schedule office hours with other teams to drop in, ask questions, discuss projects, or seek guidance.
    </p>`,
  },
    {
      title: 'Version 2.1.0 - Enhancements',
      tag: 'Improvements',
      date: '31, May 2024 ',
      shortContent: `<p style="font-size: 16px; line-height:24px;">
      <span style="font-size: 18px; font-weight: 500">IRL Gatherings - Enhanced Detail Page View</span><br/>
      <ul style="padding-left:32px ; list-style: disc;">
      <li>A dedicated "Resources" section now lists all important URLs.</li>
      <li>The "Attendees" section features UI improvements and allows searching by name, team, or project.</li>
      <li>Attendees can now tag topics of interest and filter others using these tags.</li>
      </ul>
      <br/>
      <span style="font-size: 18px; font-weight: 500">Updated Authentication Service (for both the Directory & ProtoSphere)</span>
      <br/>
      <p style="padding-left: 16px">We have updated our Authentication Service. Please verify and link your directory membership email to a login method of your choice. If you can't remember your membership email, <a style="text-decoration:underline; color:#156ff7" href="https://www.plnetwork.io/contact?showModal=getSupport" target="_blank"> contact us here</a> for assistance.</p>
      </p>`,
    },
  {
    title: 'Version 2.0.8 - Introducing Landing Page for IRL Gatherings',
    tag: 'Improvements',
    date: '10, May 2024',
    shortContent: `<p style="font-size: 16px; line-height:24px;">
    We're excited to unveil our new landing page dedicated to IRL Gatherings! Our new landing page serves as a one-stop destination for all upcoming IRL gatherings hosted within our network. Network members can easily navigate through a curated list of events, each accompanied by detailed information and RSVP options.
    </p>`,
  },
  {
    title: "Version 2.0.7 - Enhancements to Project module & Member Search",
    tag: 'Improvements',
    date: '30, Apr 2024',
    shortContent: `<div>
      <ul style="list-style: disc; font-size: 16px">
      <li>We have added a new filter in Project's page to search projects based on the focus areas that they contribute to.</li>
      <ul style="padding-left: 16px">Projects are categorized into one of these categories-
      <ul style="list-style: lower-alpha; padding:revert; font-size: 16px; line-height:24px">
      <li>Digital Human Rights: Building a foundation of freedom and safety in the digital age.</li>
      <li>Public Goods: Creating more efficient and equitable structures for global progress.</li>
      <li>Advanced Technologies: Ensuring responsible advancement in AI, AR, VR, BCI, and other emerging fields.</li>
      <li>Innovation Network: Projects that facilitate collaboration, offer technical and financial support to drive research and development.</li>
      </ul>
      </ul>
      <li>We can add a member as a contributor in Project module and the contribution details would get reflected automatically in the related member details page.</li>
      <li>In addition to the current capability of searching members by member name & team name, this enhancement will allow the members to be searched using a project name as well. Every member associated with the project as a contributor would be returned in the search result.</li>
      </ul></div>`,
  },
  {
    title: 'Version 2.0.6 - Enhanced Edit feature for Teams',
    tag: 'Improvements',
    date: '19, Apr 2024',
    shortContent: `<p style="font-size: 16px; line-height:24px;">
    Team leads can use this update to make changes to the Focus and Sub focus areas within their teams. Additionally, a quick access feature to submit a support request from the directory has been enabled.
    </p>`
  },
  {
    title: 'Version 2.0.5 - Enhanced search on Member roles',
    tag: 'Improvements',
    date: '17, Apr 2024',
    shortContent: `<div>
      <ul style="list-style: disc; font-size: 16px">
      This release is an further improvement on the filters based on member roles which was released as <a style="text-decoration:underline; color:#156ff7" href='#version-2.0.1'>Version 2.0.1</a> on 22, Mar 2024. This feature update enables users to type and search roles they are looking for into the Role filter's search bar.
      </ul></div>`,
  },
  {
    title: 'Version 2.0.4 - IRL Gatherings',
    tag: 'New Feature',
    date: '12, Apr 2024',
    isBeta:true,
    shortContent: `<div>
      <ul style="list-style: disc; font-size: 16px">
      Exciting news! We've rolled out a feature (Beta) that brings detailed participation information to our IRL Gatherings. Network members can now view a list of attendees for upcoming conferences and events, empowering them to see who else is attending and facilitating networking opportunities. With this new feature, network members can now connect with like-minded individuals, plan meetups, and maximize their conference experience.
      </ul></div>`,
  },
  {
    title: 'Version 2.0.3 - Improved Member Search',
    tag: 'Improvements',
    date: '03, Apr 2024',
    shortContent: `<div>
      <ul style="list-style: disc; font-size: 16px">
      With this update, in addition to the current capability of searching by member name, this enhancement will allow the members to be searched using a team name as well. Every member of the team would be returned in the search result.
      </ul></div>`,
  },
  {
    title: "Version 2.0.2 - Filters based on Teams' Focus areas",
    tag: 'New Feature',
    date: '29, Mar 2024',
    shortContent: `<div>
      <ul style="list-style: disc; font-size: 16px">
      <li>Added a new filter in Team's page to search teams based on the focus areas/sub focus areas that they contribute to.</li>
      <li>Teams are categorized into one of these categories-
      <ul style="list-style: lower-alpha; padding:revert; font-size: 16px; line-height:24px">
      <li> Digital Human Rights: Building a foundation of freedom and safety in the digital age.</li>
      <li>Public Goods: Creating more efficient and equitable structures for global progress.</li>
      <li>Advanced Technologies: Ensuring responsible advancement in AI, AR, VR, BCI, and other emerging fields.</li>
      <li>Innovation Network: Teams, members, and projects that facilitate collaboration, offer technical and financial support to drive research and development.</li>
      </ul>
      </li>
      </ul></div>`,
  },
  {
    title: 'Version 2.0.1 - Filters based on Member roles',
    tag: 'New Feature',
    date: '22, Mar 2024 ',
    shortContent: `<div id='version-2.0.1'>
      <ul style="list-style: disc; font-size: 16px; line-height:24px;">
      <li>Added a new filter in Member's page to search members based on their role.</li>
      <li>Roles that are currently supported in the filter are
      <ul style="list-style: lower-alpha; padding:revert; font-size: 16px">
      <li>Founder/Co-Founder</li>
      <li>CEO</li>
      <li>CTO</li>
      <li>COO</li>
      </ul>
      </li>
      </ul></div>`,
  },
];

export const tagColors = [
  {
    name: 'New Feature',
    color: '#2ABC76',
  },
  {
    name: 'Improvements',
    color: '#35BAE4',
  },
  { name: 'Beta', color: '#C169D7' },
  { name: 'Fixed', color: '#4871D9' },
];

//API route for filters in home page
export const FILTER_API_ROUTES = {
  FOCUS_AREA: '/v1/focus-areas',
};

export const ROLE_FILTER_QUERY_NAME = "memberRoles";

export const ABOUT_PLN_LINK = "https://protocol.ai/blog/transcription-pl-vision-driving-a-breakthroughs-in-computing-to-push-humanity-forward/"

export const FOCUS_AREAS_FILTER_KEYS = {
  projects: "projectAncestorFocusAreas",
  teams: "teamAncestorFocusAreas"
}

export const INVITE_ONLY_RESTRICTION_ERRORS = {
  NOT_LOGGED_IN: "not_logged_in",
  UNAUTHORIZED: "unauthorized",
}

export const IRL_LW_EE_DATES = {
  startDate:"2024-05-28",
  endDate:"2024-07-04"
}

export const EVENT_TYPE = {
  INVITE_ONLY:"INVITE_ONLY"
}

//OH guideline URL
export const OH_GUIDELINE_URL = "https://protosphere.plnetwork.io/posts/Office-Hours-Guidelines-and-Tips-clsdgrbkk000ypocoqsceyfaq"