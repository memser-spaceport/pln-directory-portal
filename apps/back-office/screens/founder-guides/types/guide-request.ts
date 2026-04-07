export type GuideArticleRequest = {
  uid: string;
  articleUid: string | null;
  title: string;
  description: string | null;
  requestedByUserUid: string;
  requestedDate: string;
  createdAt: string;
  updatedAt: string;
  article: {
    uid: string;
    title: string;
    slugURL: string;
    category: string;
    status: string;
  } | null;
  requestedByUser: {
    uid: string;
    name: string;
    email: string;
    image: { uid: string; url: string } | null;
  };
};
