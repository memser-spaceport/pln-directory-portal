import { InputField } from '@protocol-labs-network/ui';
import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';

export default function AddTeamStepThree(props) {
  const values = props?.formValues;
  const handleInputChange = props?.handleInputChange;

  return (
    <>
      <div className="inputfield hint-text pt-5">
        <InputField
          label="Preferred method of contact"
          name="contactMethod"
          required={true}
          value={values.contactMethod}
          maxLength={200}
          onChange={handleInputChange}
          placeholder="Enter contact method"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            What is the best way for people to connect with your team? (e.g.,
            team Slack channel, team email address, team Discord server/channel,
            etc.)
          </span>
        </div>
      </div>

      <div className="inputfield hint-text pt-5">
        <InputField
          label="Website address"
          name="website"
          maxLength={1000}
          required={true}
          value={values.website}
          onChange={handleInputChange}
          placeholder="Enter address here"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Let us check out what you and your team do! If you have more than
            one primary website (i.e a docs site), list one per line.
          </span>
        </div>
      </div>

      <div className="inputfield pt-5">
        <InputField
          label="LinkedIn"
          name="linkedinHandler"
          maxLength={200}
          value={values.linkedinHandler}
          onChange={handleInputChange}
          placeholder="eg., https://www.linkedin.com/in/jbenetcs/"
          className="custom-grey custom-outline-none border"
        />
      </div>
      <div className="inputfield pt-5">
        <InputField
          label="Twitter"
          name="twitterHandler"
          maxLength={200}
          value={values.twitterHandler}
          onChange={handleInputChange}
          placeholder="e.g., @protocollabs"
          className="custom-grey custom-outline-none border"
        />
      </div>

      <div className="inputfield pt-5">
        <InputField
          label="Telegram"
          onChange={handleInputChange}
          name="telegramHandler"
          maxLength={200}
          value={values.telegramHandler}
          className="custom-grey custom-outline-none border"
          placeholder="Telegram"
        />
      </div>

      <div className="inputfield hint-text pt-5">
        <InputField
          label="Blog address"
          name="blog"
          maxLength={1000}
          value={values.blog}
          onChange={handleInputChange}
          placeholder="Enter address here"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Sharing your blog link allows us to stay up to date with you, your
            team, and the direction you are going!
          </span>
        </div>
      </div>
    </>
  );
}
