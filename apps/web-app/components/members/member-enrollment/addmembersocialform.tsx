import { InputField, TextArea } from '@protocol-labs-network/ui';
import { InformationCircleIcon } from '@heroicons/react/solid';

export default function AddMemberSocialForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;

  return (
    <>
      <div className="inputfield px-8 py-4">
        <InputField
          label="LinkedIn URL"
          onChange={onChange}
          name="linkedinHandler"
          maxLength={200}
          value={values.linkedinHandler}
          className="border custom-grey custom-outline-none"
          placeholder="eg., https://www.linkedin.com/in/jbenetcs/"
        />
      </div>

      <div className="inputfield hint-text px-8 pt-4 pb-2">
        <InputField
          label="Discord Handle"
          name="discordHandler"
          onChange={onChange}
          maxLength={200}
          value={values.discordHandler}
          placeholder="e.g., name#1234"
          className="border custom-grey custom-outline-none"
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

      <div className="flex px-8 py-4">
        <div className="inputfield w-[50%] pr-4">
          <InputField
            label="Twitter Handle"
            name="twitterHandler"
            onChange={onChange}
            maxLength={200}
            value={values.twitterHandler}
            placeholder="e.g., @protocollabs"
            className="border custom-grey custom-outline-none"
          />
        </div>
        <div className="inputfield w-[50%]">
          <InputField
            label="Github Handle"
            name="githubHandler"
            value={values.githubHandler}
            maxLength={200}
            onChange={onChange}
            placeholder="Enter Github handle"
            className="border custom-grey custom-outline-none"
          />
        </div>
      </div>

      <div className="inputfield hint-text px-8 pt-5 pb-3">
        <InputField
          label="Office Hours Link"
          name="officeHours"
          maxLength={300}
          value={values.officeHours}
          onChange={onChange}
          className="border custom-grey custom-outline-none"
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

      <div className="inputfield px-8 py-4">
        <TextArea
          name="comments"
          onChange={onChange}
          maxLength={1000}
          value={values.comments}
          label="Did we miss something?"
          className="border custom-grey custom-outline-none"
          info="Let us know what else you would like to share and wish others would share to make it easier to locate and contact each other!"
        />
      </div>
    </>
  );
}
