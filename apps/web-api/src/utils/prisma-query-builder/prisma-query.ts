export type PrismaQuery = {
  select?: {
    [field: string]: boolean | PrismaQuery['select'] | PrismaQuery['include'];
  };
  include?: {
    [field: string]: boolean | PrismaQuery['include'] | PrismaQuery['select'];
  };
  where?: any;
  orderBy?: {
    [field: string]: 'asc' | 'desc' | PrismaQuery['orderBy'];
  };
  cursor?: {
    [field: string]: string | number;
  };
  take?: number;
  skip?: number;
  distinct?: any;
};
