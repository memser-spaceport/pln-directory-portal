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
    logout:'BV1DRX0M',
    settings: 'DTOAIRCK',
    settingCategory:{
      profile: 'WSSLPD6W',
      member: 'XO85CR3A',
      team: '2DSHVFY4',
    }
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
};
export const AIRTABLE_REGEX = /^rec[A-Za-z0-9]{14}$/;

export const ENROLLMENT_TYPE = {
  MEMBER: 'MEMBER',
  TEAM: 'TEAM',
};


export const LOGIN_MSG = 'Your account has been verified';
export const LOGIN_FAILED_MSG = 'Login attempt failed.Please try again'
export const LOGOUT_MSG = 'You have been logged out successfully';
export const RETRY_LOGIN_MSG = 'Please login and try again';
export const LOGGED_IN_MSG = 'You are already logged in';
export const SOMETHING_WENT_WRONG = 'Something went wrong.Please try again';
export const SCHEDULE_MEETING_MSG = 'Please proceed to schedule a meeting'

export const PAGE_ROUTES = {
  MEMBERS:'/directory/members',
  TEAMS: '/directory/teams'
}

export const SETTINGS_CONSTANTS = {
  PROFILE_SETTINGS: 'Profile Settings',
  TEAM_SETTINGS: 'Manage Teams',
  MEMBER_SETTINGS: 'Manage Members',
  ACCOUNT_SETTINGS: 'ACCOUNT SETTINGS',
  TEAM: 'team',
  MEMBER: 'member'
}

export const TAB_CONSTANTS = {
  BASIC: 'BASIC',
  SKILLS: 'SKILLS',
  SOCIAL: 'SOCIAL',
  PROJECT_DETAILS: 'PROJECT DETAILS'
}

export const MSG_CONSTANTS = {
  TEAM_UPDATE_MESSAGE:'Changes have been updated',
  MEMBER_UPDATE_MESSAGE: 'Changes have been updated',
  TEAM_CHANGE_CONF_MSG: 'Do you want to save the changes before you proceed ?',
  MEMBER_CHANGE_CONF_MSG: 'Do you want to save the changes before you proceed ?',
  PROFILE_CHANGE_CONF_MSG: 'Do you want to save the changes before you proceed ?',
  RESET_CHANGE_CONF_MSG: 'Do you want to save the changes before you proceed ?',
  NO_CHANGES_TO_RESET: 'No changes made to reset',
  NO_CHANGES_TO_SAVE: 'No changes made to save.',
}

export const BTN_LABEL_CONSTANTS = {
  RESET: 'Reset',
  READ_ARTICLE: 'Read Article',
  PLAY_VIDEO: 'Play Video',
  VIEW_PLAYLIST: 'View Playlist'
}

export const NW_SPOTLIGHT_CONSTANTS = {
  HEADING:'Network Spotlight',
  BLOG:'Blog',
  BLOG_URL:'https://protocol.ai/blog/web3-trends-2023-top-3-exciting-projects-at-protocol-labs/',
  BLOG_TITLE: 'Web3 Trends 2023: 3 Exciting Projects at Protocol Labs',
  VIDEO: 'Video',
  VIDEO_URL:'https://www.googleapis.com/youtube/v3/videos?key=AIzaSyCvn2zMiYOTq83AC8WNLL8CcmbTl9Pl53c&part=snippet&id=r-nU_MI2lV4',
  SERIES: 'Series',
  PLAYLIST_URL:'https://youtube.googleapis.com/youtube/v3/playlists?part=snippet%2CcontentDetails%2Cstatus&id=PLxkRVyHG0CI8MzS7657PjygNxvCGmMm-Y&key=AIzaSyCvn2zMiYOTq83AC8WNLL8CcmbTl9Pl53c',
  YOUTUBE_PLAYLIST:'https://www.youtube.com/watch?v=4zIVSo935rs&list=PLxkRVyHG0CI8MzS7657PjygNxvCGmMm-Y'
}

export const ADMIN_ROLE = 'DIRECTORYADMIN';
export const EMAIL_OTP_CONSTANTS = {
  INITIAL_LOGIN: {
    sendEmailTitle: "Verify Email",
    sendEmailDesc: "Please enter the membership email you used to create your directory profile. Don't remember? Contact support supportmail@protocol.ai",
    verifyOtpTitle: "Enter Code",
    verifyOtpDesc: "Please enter the code sent to"
  },
  CHANGE_EMAIL: {
    sendEmailTitle: "Enter New Email",
    sendEmailDesc: "",
    verifyOtpTitle: "Enter Code",
    verifyOtpDesc: "Please enter the code sent to"
  }
}
