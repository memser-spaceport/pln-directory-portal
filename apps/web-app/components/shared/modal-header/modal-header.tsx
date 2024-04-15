import { ReactNode } from 'react';
import { ReactComponent as CloseIcon } from '/public/assets/images/icons/closeIcon.svg';
import { Dialog } from '@headlessui/react';

type HeaderProps = {
  title?: string;
  onClose: () => void;
  image?: ReactNode;
};

export function ModalHeader({ title, image, onClose }: HeaderProps) {
  return (
    <div className="relative">
      <CloseIcon
        className="stroke-3 absolute right-5 top-5 z-40 cursor-pointer"
        onClick={() => onClose()}
      />
      <div className={`h-10 rounded-lg`}>
        {image && (
          <div className="flex h-40 rounded-tr-lg rounded-tl-lg bg-[url('/assets/images/Banner.svg')]">
            <div className="my-auto ml-5">{image}</div>
          </div>
        )}
        {title && (
          <Dialog.Title
            as="h3"
            className="text-lg font-medium leading-6 text-gray-900"
          >
            {title}
          </Dialog.Title>
        )}
      </div>
    </div>
  );
}