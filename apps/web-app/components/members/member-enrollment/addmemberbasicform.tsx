import { InputField, ProfileImageUpload, ConfirmInputField } from '@protocol-labs-network/ui';
import { UserIcon } from '@heroicons/react/solid';
import { ReactComponent as EditIcon } from '/public/assets/images/icons/edit.svg';
import { ReactComponent as InformationCircleIcon } from '../../../public/assets/images/icons/info_icon.svg';

export default function AddMemberBasicForm(props) {
  const rawLinkedAccounts = props?.authLinkedAccounts ?? ''
  const values = props.formValues;
  const onChange = props.onChange;
  const externalId = props.externalId;
  const requiredFlag = props?.isEditMode ? (props?.dataLoaded ? true : false) : true;
  const currentEmail = props.currentEmail;
  const userLinkedAccounts = rawLinkedAccounts.split(',');
  const linkAccounts = [
    { img: '/assets/images/icons/auth/google.svg', name: 'google', title: 'Google', isLinked: false },
    { img: '/assets/images/icons/auth/mdi_github.svg', name: 'github', title: 'GitHub', isLinked: false },
    { img: '/assets/images/icons/auth/wallet-cards.svg', name: 'siwe', title: 'Wallet', isLinked: false },
  ];

  const activeLinkedAccounts = linkAccounts.map(account => {
    if(userLinkedAccounts.includes(account.name)) {
      account.isLinked = true
    }
    return account;
  })

  const onLinkAccount = (account) => {
    document.dispatchEvent(new CustomEvent('auth-link-account', {detail : account}))
}

  const editEmail = () => {
    return (
      <div className="absolute right-0 top-[20px] flex cursor-pointer items-center gap-1" onClick={props.onEmailChange}>
        <EditIcon className="m-1" />
        <p className="right-0 cursor-pointer text-sm font-semibold text-[#156FF7]">Edit Email</p>
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
            enableHover={props.isEditMode || (!props.isEditMode && props.imageUrl) ? true : false}
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
          Please upload a image in PNG or JPEG format with file size less than 4MB.
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
      {props.isEmailEditActive && props.isProfileSettings && !props.isUserProfile && (
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
      {props.emailExists && <span className="pt-3 text-xs text-rose-600">Email already exists!</span>}

      {/*****  LINK ACCOUNTS SECTION  *****/}
      {props.isUserProfile && (
        <div className="lc">
          <h2 className="lc__title">Link your account for login</h2>
          <div className="lc__list">
            {activeLinkedAccounts.map((account) => (
              <div key={account.name} className="lc__list__item">
                <img className="lc__list__item__img" src={account.img} />
                <p className="lc__list__item__title">{account.title}</p>
                {!account.isLinked && <button onClick={() => onLinkAccount(account.name)} className="lc__list__item__btn">Link account</button>}
                {account.isLinked && (
                  <p className="lc__list__item__text">
                    <img src='/assets/images/icons/auth/tick_green.svg'/>
                    <span>Linked</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
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
          onClear={() => onChange({ target: { name: 'plnStartDate', value: '' } })}
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
            Please share location details to receive invitations for the network events happening in your area.
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
      <style jsx>
        {`
          .lc {
            padding: 20px;
            background: #f1f5f9;
            border-radius: 8px;
            margin: 16px 0;
          }
          .lc__title {
            font-size: 14px;
            font-weight: 600;
          }
          .lc__list {
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 16px 0;
          }
          .lc__list__item {
            display: flex;
            background: white;
            border-radius: 8px;
            padding: 12px 16px;
          }
          .lc__list__item__img {
          }
          .lc__list__item__title {
            margin: 0 8px;
            font-size: 16px;
            font-weight: 400;
            flex: 1;
          }
          .lc__list__item__btn {
            color: #156ff7;
            font-size: 14px;
            font-weight: 500;
          }
          .lc__list__item__text {
            color: #30c593;
            font-weight: 500;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 4px;
          }
        `}
      </style>
    </>
  );
}
