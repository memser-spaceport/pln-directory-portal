import { InputField, TextArea } from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberSocialForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;

  return (
    <>
      <div className="px-8 py-4">
        <InputField
          label="LinkedIn URL"
          onChange={onChange}
          name="linkedinURL"
          value={values.linkedinURL}
          placeholder="eg., https://www.linkedin.com/in/jbenetcs/"
        />
      </div>

      <div className="px-8 py-4">
        <InputField
          label="Discord Handle"
          name="discordHandler"
          onChange={onChange}
          value={values.discordHandler}
          placeholder="e.g., name#1234"
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            This will help us tag you with permissions to access the best
            Discord channels for you
          </span>
        </div>
      </div>

      <div className="flex">
        <div className="px-8 py-4">
          <InputField
            label="Twitter Handle"
            name="twitterHandler"
            onChange={onChange}
            value={values.twitterHandler}
            placeholder="e.g., @protocollabs"
          />
        </div>
        <div className="px-8 py-4">
          <InputField
            label="Github Handle"
            name="githubHandler"
            value={values.githubHandler}
            onChange={onChange}
            placeholder="Enter Github handle"
          />
        </div>
      </div>

      <div className="px-8 py-4">
        <InputField
          label="Office Hours Link"
          name="officeHours"
          value={values.officeHours}
          onChange={onChange}
        />
        <div className="flex pt-1 text-sm text-gray-400">
          <div>
            <InformationCircleIcon className="h-5 w-5" />
          </div>
          <span>
            Drop your calendar link here so others can get in touch with you at
            a time that is convenient. We recommend 15-min meetings scheduled
            via Calendly or Google Calendar appointments
          </span>
        </div>
      </div>

      <div className="px-8 py-4">
        <TextArea
          name="comments"
          onChange={onChange}
          value={values.comments}
          label="Did we miss something?"
          info="Let us know what else you would like to share and wish others would share to make it easier to locate and contact each other!"
        />
      </div>
    </>
  );
}
