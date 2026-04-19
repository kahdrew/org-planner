import { Request, Response, NextFunction } from "express";

export interface AuthPayload {
  userId: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

/**
 * Authentication middleware.
 *
 * Reads the authenticated user id from `req.session.userId`, which is set by
 * the login/register controllers and persisted via the express-session +
 * connect-mongo store. Returns 401 when no session is active.
 */
const auth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.user = { userId };
  next();
};

export default auth;
