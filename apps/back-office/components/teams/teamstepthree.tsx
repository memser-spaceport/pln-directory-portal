import { InputField } from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function TeamStepThree(props) {
  const values = props?.formValues;
  const handleInputChange = props?.handleInputChange;

  return (
    <>
      <div className="inputfield hint-text px-8 py-4">
        <InputField
          label="Preferred method of contact"
          name="contactMethod"
          required={true}
          value={values.contactMethod}
          maxLength={200}
          onChange={handleInputChange}
          disabled={!props.isEditEnabled}
          placeholder="Enter contact method"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            What is the best way for folks to connect with your team? (e.g.,
            team Slack channel, team email address, team Discord server/channel,
            etc.)
          </span>
        </div>
      </div>

      <div className="inputfield hint-text px-8 py-4">
        <InputField
          label="Website address"
          name="website"
          required={true}
          maxLength={1000}
          value={values.website}
          disabled={!props.isEditEnabled}
          onChange={handleInputChange}
          placeholder="Enter address here"
          className="custom-grey custom-outline-none border"
        />
        <div className="mt-1 flex px-2 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            Let us check out what you and your team do! If you have more than
            one primary website (i.e a docs site), list one per line.
          </span>
        </div>
      </div>

      <div className="inputfield px-8 py-4">
        <InputField
          label="LinkedIn URL"
          name="linkedinHandler"
          maxLength={200}
          value={values.linkedinHandler}
          disabled={!props.isEditEnabled}
          onChange={handleInputChange}
          placeholder="eg., https://www.linkedin.com/in/jbenetcs/"
          className="custom-grey custom-outline-none border"
        />
      </div>
      <div className="inputfield px-8 py-4">
        <InputField
          label="Twitter Handle"
          name="twitterHandler"
          maxLength={200}
          value={values.twitterHandler}
          onChange={handleInputChange}
          disabled={!props.isEditEnabled}
          placeholder="e.g., @protocollabs"
          className="custom-grey custom-outline-none border"
        />
      </div>

      <div className="inputfield hint-text px-8 py-4">
        <InputField
          label="Blog address"
          name="blog"
          maxLength={1000}
          value={values.blog}
          onChange={handleInputChange}
          disabled={!props.isEditEnabled}
          placeholder="Enter address here"
          className="custom-grey custom-outline-none border"
        />
        <div className="mt-1 flex px-2 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            Sharing your blog link allows us to stay up to date with you, your
            team, and the direction you are going!
          </span>
        </div>
      </div>
    </>
  );
}
