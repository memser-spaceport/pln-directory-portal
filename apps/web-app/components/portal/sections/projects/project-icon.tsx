import Image from 'next/image';

type ProjectIconProps = {
  alt: string;
  imageFile: string;
};

export const ProjectIcon = ({ alt, imageFile }: ProjectIconProps) => (
  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.04]">
    <div className="relative h-8 w-8">
      <Image
        src={imageFile}
        layout="fill"
        objectFit="contain"
        objectPosition="center"
        alt={alt}
      />
    </div>
  </div>
);
