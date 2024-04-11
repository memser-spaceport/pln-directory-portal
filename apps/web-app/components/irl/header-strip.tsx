import { useState } from 'react';
import JoinInfoPopup from './join-info-popup';

function HeaderStrip(props) {
  const onJoin = props.onJoin;
  const [isLoading, setIsLoading] = useState(false);

  const [url, setUrl] = useState('');

  const onClose = () => {
    setUrl('');
  };

  const onOpen = () => {
    setUrl(
      'https://airtable.com/embed/appELZxScIpW1f8Fd/shrkNpd5j4I1iF02C?backgroundColor=blueDusty'
    );
    setIsLoading(true);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  return (
    <>
      <div className="mb-[18px] mt-[18px] flex w-full flex-col items-center justify-center gap-[4px] bg-[#FFE2C8] px-[20px] py-[8px] text-center text-[14px] font-[400] lg:mt-0 lg:flex-row lg:rounded-[8px]">
        <div className="inline-block">
          <img
            className="mr-[4px] -mt-[2px] inline"
            src="/assets/images/icons/info.svg"
          />
          Joining this event but not in the network?
          <button
            onClick={onOpen}
            className="ml-[4px] rounded-[8px] bg-white px-[10px] py-[6px] text-[14px] font-[500]"
          >
           Request to access
          </button>
        </div>
      </div>
      {url && (
        <JoinInfoPopup
          isLoading={isLoading}
          handleLoad={handleLoad}
          url={url}
          onClose={onClose}
        />
      )}
    </>
  );
}

export default HeaderStrip;
