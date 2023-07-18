import { Tooltip } from "@protocol-labs-network/ui";
import { ProfileSocialLink } from "../../../../../web-app/components/shared/profile/profile-social-link/profile-social-link";
import { LINKEDIN_URL_REGEX, TWITTER_URL_REGEX, GITHUB_URL_REGEX, TELEGRAM_URL_REGEX } from "../../../../constants";

const getProfileFromURL = (props) => {
  let match;
  const handle = props?.handle;
  switch(props?.type) {
    case 'linkedin':
      match = handle?.match(LINKEDIN_URL_REGEX);
      break;
    case 'twitter':
      match = handle?.match(TWITTER_URL_REGEX);
      break;
    case 'telegram':
      match = handle?.match(TELEGRAM_URL_REGEX);
      break;
    case 'github':
      match = handle?.match(GITHUB_URL_REGEX);
      break;
    default:
      return handle;
  }
  if (match && match[1]) {
    const profile = decodeURIComponent(match[1]);
    return profile.replace(/^@/, "");
  } 
  return (props?.type === 'telegram' || props.type === 'twitter') ?  handle?.replace(/^@/, ""): handle;
}

const SocialProfile = (props) => {
  return (
    <Tooltip
      asChild
      trigger={
        <div>
          <ProfileSocialLink
            profile={getProfileFromURL(props)}
            url={props?.handle}
            type={props?.type}
            logo={props?.logo}
            height={props?.height}
            width={props?.width}
          />
        </div>
      }
      content={getProfileFromURL(props)}
    />
  );
};

export default SocialProfile;
