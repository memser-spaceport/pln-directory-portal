import { ImageCard } from '../image-card/image-card';

type EventCardProps = {
  cardUrl: string;
  imageURL: string;
  topic: string;
  eventTitle: string;
  eventDetails: string;
};

export const EventCard = ({
  cardUrl,
  imageURL,
  topic,
  eventTitle,
  eventDetails,
}: EventCardProps) => {
  return (
    <a
      href={cardUrl}
      className="relative block h-full w-full cursor-pointer"
      target="_blank"
      rel="noopener noreferrer"
    >
      <ImageCard imageURL={imageURL}>
        <div className="absolute bottom-0 left-0 w-full p-5 text-left text-white">
          <span className="leading-3.5 rounded-3xl bg-blue-600 px-3 py-1.5 text-xs font-medium">
            {topic}
          </span>
          <h3 className="mt-2.5 overflow-hidden text-ellipsis whitespace-nowrap text-2xl font-semibold">
            {eventTitle}
          </h3>
          <p className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-slate-200">
            {eventDetails}
          </p>
        </div>
      </ImageCard>
    </a>
  );
};
