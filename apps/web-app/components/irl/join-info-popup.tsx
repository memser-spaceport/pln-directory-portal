import { Dialog } from '@headlessui/react';
import { ReactComponent as CloseIcon } from '/public/assets/images/icons/close-grey.svg';
import { SpinnerIcon } from '@protocol-labs-network/ui';

const JoinInfoPopup = (props: any) => {
  const onClose = props?.onClose;
  const isLoading = props?.isLoading;
  const handleLoad = props?.handleLoad;
  const url = props?.url;

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <Dialog.Panel className="mx-auto flex h-[80vh] w-[320px] flex-col rounded bg-white lg:w-[500px] ">
          <div className="flex flex-col gap-5 px-5 pb-5 pt-4">
            {/* Header */}
            <div className="relative">
              <CloseIcon
                className="stroke-3 absolute right-0 cursor-pointer"
                onClick={onClose}
              />
            </div>
            {/* BODY */}
            <div className="flex w-full flex-1 flex-col gap-4">
              {isLoading && (
                <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2  transform">
                  <div className="flex h-20 w-56 items-center justify-center rounded-md  text-sm text-slate-600">
                    <i className="mr-3 h-5 w-5 animate-spin text-blue-600">
                      <SpinnerIcon />
                    </i>
                    <span>Loading...</span>
                  </div>
                </div>
              )}

              <iframe
                loading="lazy"
                src={url}
                width="100%"
                height="80vh"
                style={{ background: 'white', height: 'calc(80vh - 55px)' }}
                onLoad={handleLoad}
              ></iframe>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default JoinInfoPopup;
