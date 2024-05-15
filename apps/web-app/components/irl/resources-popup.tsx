import Modal from '../layout/navbar/modal/modal';

const ResourcesPopup = (props: any) => {
  const isOpen = props?.isOpen;
  const onToggleModal = props?.onClose;
  const ResourceLink = props?.resourceLink;
  const resources = props?.resources;
  const onResourceClick = props?.onResourceClick;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onToggleModal}>
        <div className="relative flex max-h-[50vh] w-[320px] flex-col gap-[18px] py-6 pl-6 pr-4 lg:max-h-[60vh] lg:min-h-[250px] lg:w-[656px]">
          <div>
            <h6 className="text-2xl font-[700] leading-8">Resources</h6>
            <button onClick={onToggleModal} className="absolute right-6 top-6">
              <img src="/assets/images/icons/close-grey.svg" alt="close" />
            </button>
          </div>
          <div className="flex h-full flex-1 flex-col gap-[14px] overflow-y-auto pr-2">
            {resources?.map((item, index) => (
              <div
              key={`popup-resource-${index}`}
                className={`${
                  index !== resources?.length - 1
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
