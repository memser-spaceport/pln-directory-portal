import { APP_ANALYTICS_EVENTS } from 'apps/web-app/constants';
import Modal from '../layout/navbar/modal/modal';

const ResourcesPopup = (props: any) => {
  const isOpen = props?.isOpen;
  const onToggleModal = props?.onClose;
  const ResourceLink = props?.resourceLink;
  const resources = props?.allResources ?? [];
  const onResourceClick = props?.onResourceClick;
  const resourcesToShow = props?.resourcesToShow ?? [];
  const onLogin = props?.onLogin;
  const hasPrivateResources = resources.length > resourcesToShow?.length;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onToggleModal}>
        <div className="relative flex max-h-[50vh] w-[320px] flex-col gap-[18px] py-6 pl-6 pr-4 lg:max-h-[60vh]  lg:w-[656px]">
          <div>
            <div className="flex items-center gap-1">
              <h6 className="text-2xl font-[700] leading-8">Resources</h6>
              <span className="mt-[5px] text-[14px] font-[400]">
                ({resources?.length})
              </span>
            </div>
            <button onClick={onToggleModal} className="absolute right-6 top-6">
              <img src="/assets/images/icons/close-grey.svg" alt="close" />
            </button>
          </div>
          {hasPrivateResources && (
            <div className="flex w-full items-center justify-center rounded-lg bg-[#FFE2C8] px-5 py-2">
              <div className=" flex items-center text-sm leading-[18px] text-[#000000]">
                <img
                  className="mr-[4px] -mt-[2px] inline"
                  src="/assets/images/icons/info.svg"
                />
                <span>
                  This list contains private links. Please{' '}
                  <span
                    onClick={() =>
                      onLogin(
                        APP_ANALYTICS_EVENTS.IRL_RESOURCE_POPUP_LOGIN_CLICKED
                      )
                    }
                    className="cursor-pointer text-[13px] font-semibold leading-5 text-[#156FF7]"
                  >
                    login
                  </span>
                  {` `} to access
                </span>
              </div>
            </div>
          )}
          <div className="flex h-full flex-1 flex-col gap-[14px] overflow-y-auto pr-2">
            {resourcesToShow?.map((item, index) => (
              <div
                key={`popup-resource-${index}`}
                className={`${
                  index !== resourcesToShow?.length - 1
                    ? 'border-b border-[#CBD5E1]'
                    : ''
                } pb-[14px]`}
              >
                <ResourceLink resource={item} onClick={onResourceClick} />
              </div>
            ))}
          </div>
        </div>
      </Modal>
      <style jsx>
        {`
          ::-webkit-scrollbar {
            width: 6px;
            background: #f7f7f7;
          }
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          ::-webkit-scrollbar-thumb {
            background-color: #cbd5e1;
            border-radius: 10px;
          }
        `}
      </style>
    </>
  );
};

export default ResourcesPopup;
