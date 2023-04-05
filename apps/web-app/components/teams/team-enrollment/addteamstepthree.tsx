import { InputField } from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberStepThree(props) {
  const values = props?.formValues;
  const handleInputChange = props?.handleInputChange;
  const handleDropDownChange = props?.handleDropDownChange;

  return (
    <>
      <div className="inputfield hint-text px-8 py-4">
        <InputField
          label="Preferred method of contact*"
          name="contactMethod"
          value={values.contactMethod}
          onChange={handleInputChange}
          placeholder="Enter contact method"
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
          label="Website address*"
          name="website"
          value={values.website}
          onChange={handleInputChange}
          placeholder="Enter address here"
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
          value={values.linkedinHandler}
          onChange={handleInputChange}
          placeholder="eg., https://www.linkedin.com/in/jbenetcs/"
        />
      </div>
      <div className="inputfield px-8 py-4">
        <InputField
          label="Twitter Handle"
          name="twitter"
          value={values.twitter}
          onChange={handleInputChange}
          placeholder="e.g., @protocollabs"
        />
      </div>

      <div className="inputfield hint-text px-8 py-4">
        <InputField
          label="Blog address"
          name="blog"
          value={values.blog}
          onChange={handleInputChange}
          placeholder="Enter address here"
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
