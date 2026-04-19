import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

/**
 * Persist req.session to the store and wait for the write to complete before
 * responding. This prevents a race where the client sends its next request
 * before the session cookie is actually bound to a stored session.
 */
function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, name });
    req.session.userId = user._id.toString();
    await saveSession(req);
    res
      .status(201)
      .json({ user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    req.session.userId = user._id.toString();
    await saveSession(req);
    res.json({ user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/auth/me — return the currently authenticated user, derived from
 * the session cookie. Used by the client on page load to hydrate auth state
 * without needing a token in localStorage.
 */
export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const user = await User.findById(userId);
    if (!user) {
      // Session points at a user that no longer exists; clear it.
      req.session.destroy(() => {
        res.status(401).json({ error: "Not authenticated" });
      });
      return;
    }
    res.json({ user: { id: user._id, email: user.email, name: user.name } });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/auth/logout — destroy the session and clear the cookie on the
 * client. Idempotent: always returns 200 even if no session existed.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  if (!req.session) {
    res.status(200).json({ message: "Logged out" });
    return;
  }
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to log out" });
      return;
    }
    res.clearCookie("orgplanner.sid");
    res.status(200).json({ message: "Logged out" });
  });
};
