# Authentication Patterns — Passport.js + JWT + OAuth

> Sources: [passport-jwt](https://www.passportjs.org/packages/passport-jwt/), [passport-google-oauth20](https://www.passportjs.org/packages/passport-google-oauth20/), [passport-local](https://www.passportjs.org/packages/passport-local/)

---

## 1. Package Setup

```bash
npm install passport passport-local passport-jwt passport-google-oauth20
npm install jsonwebtoken bcryptjs
npm install @types/passport @types/passport-local @types/passport-jwt
npm install @types/passport-google-oauth20 @types/jsonwebtoken @types/bcryptjs
```

For Microsoft OAuth:
```bash
npm install passport-microsoft
# or use passport-azure-ad for Azure AD
```

---

## 2. Architecture Overview

```
Client (Chrome Extension / Web)
  ↓
  POST /api/auth/login (email/password)
  POST /api/auth/google (OAuth redirect)
  POST /api/auth/microsoft (OAuth redirect)
  ↓
  Returns: { accessToken, refreshToken }
  ↓
  All API calls: Authorization: Bearer <accessToken>
  ↓
  POST /api/auth/refresh (when access token expires)
```

**Key Design Decisions:**
- **Stateless JWT** — no server-side session store needed
- **Access + Refresh token pair** — short-lived access (15 min), long-lived refresh (7 days)
- **OAuth providers** return same JWT format as local auth
- Chrome extension stores tokens in `chrome.storage.session`

---

## 3. JWT Utility Module

```typescript
// modules/auth/jwt.utils.ts
import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
}

export function generateTokenPair(payload: TokenPayload) {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}
```

---

## 4. Passport Strategies

### Local Strategy (Email/Password)
```typescript
// modules/auth/strategies/local.strategy.ts
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import { User } from '../../users/user.model';

export const localStrategy = new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
  },
  async (email, password, done) => {
    try {
      const user = await User.findOne({ email, provider: 'local' })
        .select('+passwordHash')
        .lean();

      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Don't return password hash
      const { passwordHash, ...userWithoutPassword } = user;
      return done(null, userWithoutPassword);
    } catch (error) {
      return done(error);
    }
  }
);
```

### JWT Strategy (for protecting routes)
```typescript
// modules/auth/strategies/jwt.strategy.ts
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { User } from '../../users/user.model';

const opts: StrategyOptionsWithoutRequest = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_ACCESS_SECRET!,
};

export const jwtStrategy = new JwtStrategy(opts, async (payload, done) => {
  try {
    const user = await User.findById(payload.userId).lean();
    if (!user || !user.isActive) {
      return done(null, false);
    }
    return done(null, user);
  } catch (error) {
    return done(error, false);
  }
});
```

### Google OAuth Strategy
```typescript
// modules/auth/strategies/google.strategy.ts
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import { User } from '../../users/user.model';

export const googleStrategy = new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
    scope: ['profile', 'email'],
  },
  async (accessToken, refreshToken, profile: Profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('No email found in Google profile'));
      }

      // Find or create user
      let user = await User.findOne({
        $or: [
          { provider: 'google', providerId: profile.id },
          { email },
        ],
      });

      if (!user) {
        user = await User.create({
          email,
          name: profile.displayName,
          provider: 'google',
          providerId: profile.id,
          avatar: profile.photos?.[0]?.value,
          passwordHash: '', // Not needed for OAuth
        });
      } else if (user.provider !== 'google') {
        // Link Google to existing account
        user.provider = 'google';
        user.providerId = profile.id;
        if (!user.avatar && profile.photos?.[0]?.value) {
          user.avatar = profile.photos[0].value;
        }
        await user.save();
      }

      return done(null, user);
    } catch (error) {
      return done(error as Error);
    }
  }
);
```

### Microsoft OAuth Strategy
```typescript
// modules/auth/strategies/microsoft.strategy.ts
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { User } from '../../users/user.model';

export const microsoftStrategy = new MicrosoftStrategy(
  {
    clientID: process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || '/api/auth/microsoft/callback',
    scope: ['user.read'],
    tenant: 'common', // 'common' allows personal + work accounts
  },
  async (accessToken: string, refreshToken: string, profile: any, done: Function) => {
    try {
      const email = profile.emails?.[0]?.value || profile._json?.mail;
      if (!email) {
        return done(new Error('No email found in Microsoft profile'));
      }

      let user = await User.findOne({
        $or: [
          { provider: 'microsoft', providerId: profile.id },
          { email },
        ],
      });

      if (!user) {
        user = await User.create({
          email,
          name: profile.displayName,
          provider: 'microsoft',
          providerId: profile.id,
          passwordHash: '',
        });
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
);
```

---

## 5. Passport Configuration

```typescript
// modules/auth/passport.config.ts
import passport from 'passport';
import { localStrategy } from './strategies/local.strategy';
import { jwtStrategy } from './strategies/jwt.strategy';
import { googleStrategy } from './strategies/google.strategy';
import { microsoftStrategy } from './strategies/microsoft.strategy';

export function configurePassport(): void {
  passport.use('local', localStrategy);
  passport.use('jwt', jwtStrategy);
  passport.use('google', googleStrategy);
  passport.use('microsoft', microsoftStrategy);

  // No serialize/deserialize needed — we're using JWT, not sessions
}
```

---

## 6. Auth Middleware

```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import passport from 'passport';

// Protect routes with JWT
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('jwt', { session: false }, (err: Error, user: any) => {
    if (err) return next(err);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      return;
    }
    req.user = user;
    next();
  })(req, res, next);
}

// Role-based access control
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes((req.user as any).role)) {
      res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}
```

---

## 7. Auth Routes

```typescript
// modules/auth/auth.routes.ts
import { Router } from 'express';
import passport from 'passport';
import * as authController from './auth.controller';
import { validate } from '../../middleware/validate';
import { loginSchema, registerSchema } from './auth.validation';

const router = Router();

// ---- Local Auth ----
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authController.logout);

// ---- Google OAuth ----
router.get('/google', passport.authenticate('google', {
  session: false,
  scope: ['profile', 'email'],
}));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  authController.oauthCallback
);

// ---- Microsoft OAuth ----
router.get('/microsoft', passport.authenticate('microsoft', {
  session: false,
  scope: ['user.read'],
}));

router.get('/microsoft/callback',
  passport.authenticate('microsoft', { session: false, failureRedirect: '/login' }),
  authController.oauthCallback
);

export { router as authRoutes };
```

---

## 8. Auth Controller

```typescript
// modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import { User } from '../users/user.model';
import { generateTokenPair, verifyRefreshToken, TokenPayload } from './jwt.utils';
import { AppError } from '../../middleware/errorHandler';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, name } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError(409, 'Email already registered', 'DUPLICATE_EMAIL');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      name,
      passwordHash,
      provider: 'local',
    });

    const payload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const tokens = generateTokenPair(payload);
    res.status(201).json({ user: { id: user._id, email, name, role: user.role }, ...tokens });
  } catch (error) {
    next(error);
  }
}

export function login(req: Request, res: Response, next: NextFunction) {
  passport.authenticate('local', { session: false }, (err: Error, user: any, info: any) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).json({ error: info?.message || 'Invalid credentials' });
    }

    const payload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const tokens = generateTokenPair(payload);

    // Update last login
    User.updateOne({ _id: user._id }, { lastLoginAt: new Date() }).exec();

    res.json({
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
  })(req, res, next);
}

export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError(400, 'Refresh token required', 'MISSING_TOKEN');
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new AppError(401, 'Invalid refresh token', 'INVALID_TOKEN');
    }

    const newPayload: TokenPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const tokens = generateTokenPair(newPayload);
    res.json(tokens);
  } catch (error) {
    if ((error as any).name === 'JsonWebTokenError' || (error as any).name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_TOKEN' });
    }
    next(error);
  }
}

export function oauthCallback(req: Request, res: Response) {
  const user = req.user as any;
  const payload: TokenPayload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  const tokens = generateTokenPair(payload);

  // For Chrome extension: redirect with tokens in URL fragment (never in query params)
  // The extension's callback page reads from the fragment
  const redirectUrl = `${process.env.EXTENSION_REDIRECT_URL}#access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}`;
  res.redirect(redirectUrl);
}

export async function logout(req: Request, res: Response) {
  // With stateless JWT, logout is client-side (delete tokens)
  // Optionally: add refresh token to a blocklist in Redis/DB
  res.json({ message: 'Logged out successfully' });
}
```

---

## 9. Auth Validation Schemas

```typescript
// modules/auth/auth.validation.ts
import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    name: z.string().min(1, 'Name is required').max(100),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
  }),
});
```

---

## 10. Chrome Extension OAuth Flow

For OAuth in Chrome extensions, use `chrome.identity.launchWebAuthFlow`:

```typescript
// extension/auth.ts
async function loginWithGoogle(): Promise<{ accessToken: string; refreshToken: string }> {
  const authUrl = `${API_BASE_URL}/api/auth/google`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl,
        interactive: true,
      },
      (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          reject(chrome.runtime.lastError);
          return;
        }

        // Parse tokens from URL fragment
        const url = new URL(redirectUrl);
        const params = new URLSearchParams(url.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          // Store in session storage
          chrome.storage.session.set({ accessToken, refreshToken });
          resolve({ accessToken, refreshToken });
        } else {
          reject(new Error('No tokens received'));
        }
      }
    );
  });
}
```

---

## 11. Token Refresh in Extension

```typescript
// extension/api.ts
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const { accessToken } = await chrome.storage.session.get('accessToken');

  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  // If 401, try refresh
  if (response.status === 401) {
    const newTokens = await refreshTokens();
    if (newTokens) {
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${newTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    }
  }

  return response;
}

async function refreshTokens() {
  const { refreshToken } = await chrome.storage.session.get('refreshToken');
  if (!refreshToken) return null;

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    // Refresh failed — user must re-login
    await chrome.storage.session.clear();
    return null;
  }

  const tokens = await response.json();
  await chrome.storage.session.set(tokens);
  return tokens;
}
```
