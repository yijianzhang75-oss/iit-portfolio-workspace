export type CurrentUser = {
  id: string;
  displayName: string;
  status: string;
};

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
    }
  }
}
