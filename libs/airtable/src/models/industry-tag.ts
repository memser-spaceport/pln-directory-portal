export interface IAirtableIndustryTag {
  id: string;
  fields: IAirtableIndustryTagFields;
}

export interface IAirtableIndustryTagFields {
  Tags: string;
  Definition?: string;
  Categories?: string[];
}
