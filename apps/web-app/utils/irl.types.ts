export interface IIrlCard{
    id: string;
    name: string;
    description: string;
    location: string;
    slugUrl: string;
    bannerUrl: string;
    startDate: Date;
    endDate: Date;
    type: string;
    attendees: number;
    isPastEvent: boolean;
}