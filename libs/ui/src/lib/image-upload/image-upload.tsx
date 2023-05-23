import { useState } from 'react';
import Image from 'next/image';
import { ReactComponent as CameraIcon } from '../../assets/icons/cameraicon.svg';
import { CameraIcon as Camera } from '@heroicons/react/solid';

type Shape = 'circle' | 'square';

type Props = {
  imageUrl?: string;
  onImageChange: (file: File) => void;
  maxSize: number; // Size in MB
  previewImageShape?: Shape;
  disabled?: boolean;
  enableHover?: boolean;
  avatarIcon?: React.ReactNode;
};

function bytesToSize(bytes: number) {
  // const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  // if (bytes === 0) return 'n/a'
  // const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10)
  // if (i === 0) return `${bytes} ${sizes[i]})`
  return parseFloat((bytes / 1024 ** 2).toFixed(1));
}

export function ProfileImageUpload({
  imageUrl,
  onImageChange,
  maxSize,
  previewImageShape = 'circle',
  disabled = false,
  enableHover = true,
  avatarIcon: AvatarIcon,
}: Props) {
  const [, setImage] = useState<File | null>(null);
  const [uploadError, setError] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const previewClassName =
    previewImageShape === 'circle' ? 'rounded-full' : 'rounded-xl';

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const isValidFormat = ['image/jpeg', 'image/png'].includes(file.type);
      if (isValidFormat) {
        setError('');
      } else {
        setError(`Please upload image in jpeg or png format`);
        return;
      }
      const sizeInMB = bytesToSize(file.size);
      if (sizeInMB <= maxSize) {
        setImage(file);
        onImageChange(file);
        setError('');
      } else {
        setError(`Please upload a file less than ${maxSize}MB`);
      }
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const divProps = {
    className: `relative h-24 w-24 overflow-hidden border-4 border-gray-300 ${previewClassName}`,
    ...(enableHover && { onMouseLeave: handleMouseLeave }), // Conditionally add onMouseLeave prop
    ...(enableHover && { onMouseEnter: handleMouseEnter }), // Conditionally add onMouseEnter prop
  };

  return (
    <>
      <div {...divProps}>
        {imageUrl ? (
          <div className="flex h-full w-full flex-col items-center justify-center">
            <Image
              src={imageUrl}
              alt="Profile Image"
              layout="fill"
              objectFit="cover"
            />
            {isHovered && (
              <div className="absolute flex h-full w-full flex-col items-center justify-center bg-white opacity-70">
                <CameraIcon className="fill-black-500 h-10 w-10" />
              </div>
            )}
          </div>
        ) : AvatarIcon ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gray-100">
            <AvatarIcon className="w-22 h-22 bg-gray-200 fill-white" />
            {isHovered && (
              <div className="absolute flex h-full w-full flex-col items-center justify-center bg-white opacity-50">
                <CameraIcon className="fill-black-500 h-10 w-10" />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gray-100">
            <CameraIcon />
            <span className="font-size-12 text-sm text-blue-600">
              Add Image
            </span>
          </div>
        )}
        <input
          type="file"
          accept="image/png, image/jpeg"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={handleImageChange}
          disabled={disabled}
        />
      </div>
      <span className="absolute pt-1 text-xs text-rose-600">{uploadError}</span>
    </>
  );
}

export default ProfileImageUpload;
