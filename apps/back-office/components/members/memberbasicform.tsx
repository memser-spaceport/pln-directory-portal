import { InputField, ProfileImageUpload } from '@protocol-labs-network/ui';
import { ReactComponent as InformationCircleIcon } from '../../public/assets/icons/info_icon.svg';

export default function AddMemberBasicForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;

  return (
    <>
      <div className="flex pt-5">
        <div className="profileImage justify-content pr-5">
          <ProfileImageUpload
            imageUrl={props.imageUrl}
            maxSize={4}
            onImageChange={props.handleImageChange}
            disabled={!props.isEditEnabled}
          />
        </div>
        <div className="w-full">
          <InputField
            required={true}
            name="name"
            label="Name"
            pattern="^[a-zA-Z\s]*$"
            maxLength={64}
            value={values?.name}
            disabled={!props.isEditEnabled}
            onChange={onChange}
            placeholder="Enter your full name"
            className="custom-grey custom-outline-none border"
          />
        </div>
      </div>

      <div className="flex pt-3">
        <div>
          <InformationCircleIcon />
        </div>
        <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
          Please upload a image in PNG or JPEG format with file size less that
          4MB.
        </span>
      </div>

      <div className="inputfield pt-5">
        <InputField
          required
          name="email"
          type="email"
          label="Email"
          maxLength={255}
          value={values?.email}
          disabled={!props.isEditEnabled}
          onChange={onChange}
          onBlur={props.onEmailBlur && props.onEmailBlur}
          placeholder="Enter your email address"
          className="custom-grey custom-outline-none border"
        />
      </div>

      {props.emailExists && (
        <span className="pt-3 text-sm text-rose-600">
          Email already exists!
        </span>
      )}

      <div className="pt-5">
        <InputField
          name="plnStartDate"
          type="date"
          onChange={onChange}
          onKeyDown={(e) => e.preventDefault()}
          value={values?.plnStartDate}
          disabled={!props.isEditEnabled}
          label="PLN Start Date"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            What date did your team join the PLN? If you don&apos;t know, pick
            today.
          </span>
        </div>
      </div>

      <div className="inputfield cityname pt-5">
        <InputField
          name="city"
          label="City"
          value={values?.city}
          disabled={!props.isEditEnabled}
          pattern="^[a-zA-Z\s]*$"
          maxLength={100}
          onChange={onChange}
          placeholder="Enter your city name"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Please share your location so we can be sure to invite you to in
            person events in your area!
          </span>
        </div>
      </div>

      <div className="flex pt-5">
        <div className="inputfield basis-6/12 pr-6">
          <InputField
            name="region"
            label="State or Province"
            value={values?.region}
            disabled={!props.isEditEnabled}
            pattern="^[a-zA-Z\s]*$"
            maxLength={100}
            onChange={onChange}
            placeholder="Enter state or province"
            className="custom-grey custom-outline-none border"
          />
        </div>
        <div className="inputfield basis-6/12">
          <InputField
            name="country"
            label="Country"
            pattern="^[a-zA-Z\s]*$"
            value={values?.country}
            disabled={!props.isEditEnabled}
            maxLength={100}
            onChange={onChange}
            placeholder="Enter country"
            className="custom-grey custom-outline-none border"
          />
        </div>
      </div>
    </>
  );
}
