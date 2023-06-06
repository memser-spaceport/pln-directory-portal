import { MouseEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ReactComponent as CameraIcon } from '../../assets/icons/cameraicon.svg';
import { ReactComponent as RemoveIcon } from '../../assets/icons/trash_icon.svg';
import { ReactComponent as RecycleIcon } from '../../assets/icons/recycle.svg';

type Shape = 'circle' | 'square';

type Props = {
  imageUrl?: string;
  onImageChange: (file: File | null) => void;
  maxSize: number; // Size in MB
  previewImageShape?: Shape;
  disabled?: boolean;
  enableHover?: boolean;
  avatarIcon?: (props: React.ComponentProps<'svg'>) => JSX.Element;
  resetImg?: boolean;
  onResetImg?: () => void;
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
  resetImg,
  onResetImg
}: Props) {
  const [, setImage] = useState<File | null>(null);
  const [uploadError, setError] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const previewClassName =
    previewImageShape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (enableHover === false) {
      setIsHovered(false);
    }
    if (resetImg && onResetImg) {
      setError('');
    }
  }, [enableHover, resetImg]);

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

  const editFunction = (
    evt: MouseEvent<SVGSVGElement, globalThis.MouseEvent>
  ) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if(onResetImg) {
      onResetImg();
    }
    inputRef.current?.click();
  };

  const deleteFunction = (
    evt: MouseEvent<SVGSVGElement, globalThis.MouseEvent>
  ) => {
    evt.preventDefault();
    evt.stopPropagation();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setImage(null);
    onImageChange(null);
  };

  return (
    <>
      <div {...divProps}>
        <div className="absolute left-0 top-0 flex h-full w-full flex-col items-center justify-center bg-gray-100">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt="Profile Image"
              width={95}
              height={95}
            />
          ) : AvatarIcon ? (
            <AvatarIcon className="w-22 h-22 bg-gray-200 fill-white" />
          ) : (
            <>
              <CameraIcon />
              <span className="font-size-12 text-sm text-blue-600">
                Add Image
              </span>
            </>
          )}
          <input
            id="image-upload-input"
            type="file"
            ref={inputRef}
            accept="image/png, image/jpeg"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={handleImageChange}
            disabled={disabled}
          />
        </div>
        {isHovered && (
          <div className="absolute left-0 top-0 flex h-full w-full items-center justify-center bg-black bg-opacity-40">
            <span>
              <RecycleIcon
                onClick={(evt) => editFunction(evt)}
                className="h-8 w-8 cursor-pointer"
              />
            </span>
            {imageUrl && (
              <span className="pl-2">
                <RemoveIcon
                  onClick={(evt) => deleteFunction(evt)}
                  className="h-8 w-8 cursor-pointer"
                />
              </span>
            )}
          </div>
        )}
      </div>
      <span className="absolute pt-1 text-xs text-rose-600">{uploadError}</span>
    </>
  );
}

export default ProfileImageUpload;
