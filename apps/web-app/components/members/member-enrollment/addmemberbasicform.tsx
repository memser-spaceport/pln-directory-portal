import {
  InputField,
  ProfileImageUpload,
  ConfirmInputField,
} from '@protocol-labs-network/ui';
import { UserIcon } from '@heroicons/react/solid';
import { ReactComponent as EditIcon } from '/public/assets/images/icons/edit.svg';
import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';

export default function AddMemberBasicForm(props) {
  const values = props.formValues;
  const onChange = props.onChange;
  const onNewEmailInputChange = props.onNewEmailInputChange;
  const requiredFlag = props?.isEditMode
    ? props?.dataLoaded
      ? true
      : false
    : true;
  const currentEmail = props.currentEmail;
  const isCurrentMailBoxNeeded = props.isProfileSettings
    ? props.isUserProfile
      ? true
      : props.isEmailEditActive
      ? false
      : true
    : true;

  const editEmail = () => {
    return (

      <div
      className="absolute right-0 top-[20px] flex cursor-pointer items-center gap-1"
      onClick={props.onEmailChange}
    >
      <EditIcon className="m-1" />
      <p className="right-0 cursor-pointer text-sm font-semibold text-[#156FF7]">
        Edit Email
      </p>
    </div>
    );
  };
  return (
    <>
      <div className="flex pt-5">
        <div className="profileImage">
          <ProfileImageUpload
            imageUrl={props.imageUrl}
            maxSize={4}
            enableHover={
              props.isEditMode || (!props.isEditMode && props.imageUrl)
                ? true
                : false
            }
            avatarIcon={props.isEditMode && UserIcon}
            onImageChange={props.handleImageChange}
            resetImg={props.resetImg}
            onResetImg={props.onResetImg}
          />
        </div>
        <div className="namefield inputfield">
          <InputField
            required={requiredFlag}
            name="name"
            label="Name"
            pattern="^[a-zA-Z\s]*$"
            maxLength={64}
            value={values?.name}
            onChange={onChange}
            placeholder="Enter your full name"
            className="custom-grey custom-outline-none border"
          />
        </div>
      </div>
      <div className="flex pt-5">
        <div>
          <InformationCircleIcon />
        </div>
        <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
          Please upload a image in PNG or JPEG format with file size less than
          4MB.
        </span>
      </div>
      {!props.isUserProfile && !props.isEmailEditActive && (
        <div className="inputfield relative pt-5">
          <InputField
            required={requiredFlag}
            name="email"
            type="email"
            label="Email"
            maxLength={255}
            value={values?.email}
            onKeyDown={() => props?.setDisableNext(true)}
            disabled={props.disableEmail ? props.disableEmail : false}
            onChange={onChange}
            onBlur={props.onEmailBlur && props.onEmailBlur}
            placeholder="Enter your email address"
            className="custom-grey custom-outline-none border"
          />
          {!props.isEmailEditActive && props.isProfileSettings && editEmail()}
        </div>
      )}

      {props.isUserProfile && (
        <div className="inputfield relative pt-5">
          <p className="text-sm font-bold">Email</p>
          <p className="mt-[12px] text-sm text-slate-900">{values?.email}</p>
          {!props.isEmailEditActive && props.isProfileSettings && editEmail()}
        </div>
      )}
      {props.isEmailEditActive &&
        props.isProfileSettings &&
        !props.isUserProfile && (
          <div className="relative flex pt-5">
            <ConfirmInputField
              name="email"
              currentEmail={currentEmail}
              onChange={onChange}
              pattern="^[a-zA-Z\s]*$"
              type="email"
              label="Enter New Email"
              className="custom-grey custom-outline-none border"
            />
            <p
              onClick={props.onCancelEmailChange}
              className="absolute top-[20px] right-0 cursor-pointer text-sm font-semibold text-[#156FF7]"
            >
              Cancel
            </p>
          </div>
        )}
      {props.emailExists && (
        <span className="pt-3 text-xs text-rose-600">
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
          hasClear={true}
          label="PLN Join Date"
          onClear={()=>onChange({target:{name:'plnStartDate', value:''}})}
          className="custom-grey custom-outline-none border"
        />
      </div>
      <div className="inputfield pt-5">
        <InputField
          name="city"
          label="City"
          value={values?.city}
          pattern="^[a-zA-Z\s]*$"
          maxLength={100}
          onChange={onChange}
          placeholder="Enter your city"
          className="custom-grey custom-outline-none border"
        />
        <div className="flex pt-3">
          <div>
            <InformationCircleIcon />
          </div>
          <span className="pl-1.5 text-[13px] leading-[18px] text-[#0F172A] opacity-40">
            Please share location details to receive invitations for the network
            events happening in your area.
          </span>
        </div>
      </div>
      <div className="flex pt-5">
        <div className="inputfield w-[50%] pr-6">
          <InputField
            name="region"
            label="State or Province"
            value={values?.region}
            pattern="^[a-zA-Z\s]*$"
            maxLength={100}
            onChange={onChange}
            placeholder="Enter state or province"
            className="custom-grey custom-outline-none border"
          />
        </div>
        <div className="inputfield w-[50%]">
          <InputField
            name="country"
            label="Country"
            pattern="^[a-zA-Z\s]*$"
            value={values?.country}
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
