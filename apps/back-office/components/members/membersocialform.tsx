import { InputField, TextArea } from '@protocol-labs-network/ui';
import { ReactComponent as InformationCircleIcon } from '../../public/assets/icons/info_icon.svg';

export default function AddMemberSocialForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;

  return (
    <>
      <div className="inputfield pt-5">
        <InputField
          label="LinkedIn URL"
          onChange={onChange}
          name="linkedinHandler"
          maxLength={200}
          value={values.linkedinHandler}
          disabled={!props.isEditEnabled}
          className="custom-grey custom-outline-none border"
          placeholder="eg., https://www.linkedin.com/in/jbenetcs/"
        />
      </div>

      <div className="inputfield hint-text pt-5">
        <InputField
          label="Discord Handle"
          name="discordHandler"
          onChange={onChange}
          maxLength={200}
          disabled={!props.isEditEnabled}
          value={values.discordHandler}
          placeholder="e.g., name#1234"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            This will help us tag you with permissions to access the best
            Discord channels for you
          </span>
        </div>
      </div>

      <div className="flex pt-5">
        <div className="inputfield w-[50%] pr-4">
          <InputField
            label="Twitter Handle"
            name="twitterHandler"
            onChange={onChange}
            maxLength={200}
            disabled={!props.isEditEnabled}
            value={values.twitterHandler}
            placeholder="e.g., @protocollabs"
            className="custom-grey custom-outline-none border"
          />
        </div>
        <div className="inputfield w-[50%]">
          <InputField
            label="Github Handle"
            name="githubHandler"
            value={values.githubHandler}
            disabled={!props.isEditEnabled}
            maxLength={200}
            onChange={onChange}
            placeholder="Enter Github handle"
            className="custom-grey custom-outline-none border"
          />
        </div>
      </div>

      <div className="inputfield hint-text pt-5">
        <InputField
          label="Office Hours Link"
          name="officeHours"
          maxLength={300}
          disabled={!props.isEditEnabled}
          value={values.officeHours}
          onChange={onChange}
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Drop your calendar link here so others can get in touch with you at
            a time that is convenient. We recommend 15-min meetings scheduled
            via Calendly or Google Calendar appointments
          </span>
        </div>
      </div>

      <div className="inputfield pt-5">
        <TextArea
          name="comments"
          onChange={onChange}
          disabled={!props.isEditEnabled}
          maxLength={1000}
          value={values.comments}
          label="Did we miss something?"
          className="custom-grey custom-outline-none min-h-[60px] border"
          info="Let us know what else you would like to share and wish others would share to make it easier to locate and contact each other!"
        />
      </div>
    </>
  );
}
