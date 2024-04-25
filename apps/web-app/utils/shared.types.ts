import { IProject } from "./projects.types";
import { ITeam } from "./teams.types";



export type IFocusArea = {
    uid: string;
    title: string;
    description: string;
    createdAt: string;
    updatedAt: string;
    parentUid: string;
    children: IFocusArea[];
    teamAncestorFocusAreas: ITeam[];
    projectAncestorFocusAreas: IProject[]
  }