import { Tooltip } from "@protocol-labs-network/ui";
import { ProfileSocialLink } from "../../../../../web-app/components/shared/profile/profile-social-link/profile-social-link";

const SocialProfile = (props) => {
  return (
    <Tooltip
      asChild
      trigger={
        <div>
          <ProfileSocialLink
            url={props?.handle}
            type={props?.type}
            logo={props?.logo}
            height={props?.height}
            width={props?.width}
          />
        </div>
      }
      content={props?.handle}
    />
  );
};

export default SocialProfile;
