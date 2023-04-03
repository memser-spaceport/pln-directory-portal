import { CameraIcon } from '@heroicons/react/outline';
import { useState } from 'react';
import Image from 'next/image';

type Props = {
  imageUrl?: string;
  onImageChange: (file: File) => void;
  maxSize: number; // Size in MB
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
}: Props) {
  const [, setImage] = useState<File | null>(null);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const sizeInMB = bytesToSize(file.size);
      if (sizeInMB <= maxSize) {
        setImage(file);
        onImageChange(file);
      } else {
        window.alert('Upload file less than 4MB');
      }
    }
  };

  return (
    <div className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-gray-300">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt="Profile Image"
          layout="fill"
          objectFit="cover"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gray-100">
          <CameraIcon className="h-10 w-10 text-gray-300" />
          <span className="text-sm text-blue-600">Add Image</span>
        </div>
      )}
      <input
        type="file"
        accept="image/png, image/jpeg"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onChange={handleImageChange}
      />
    </div>
  );
}

export default ProfileImageUpload;
