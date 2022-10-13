import Image from 'next/image';

export const ProjectIcon = ({ imageFile }) => (
  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.04]">
    <div className="relative h-8 w-8">
      <Image
        src={imageFile}
        layout="fill"
        objectFit="contain"
        objectPosition="center"
      />
    </div>
  </div>
);
