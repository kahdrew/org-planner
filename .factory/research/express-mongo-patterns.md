# Express + MongoDB (Mongoose 9) + TypeScript — Patterns

> Sources: [Mongoose TypeScript Schemas](https://mongoosejs.com/docs/typescript/schemas.html), [Mongoose TypeScript](https://mongoosejs.com/docs/typescript.html), [Express Error Handling](https://expressjs.com/en/guide/error-handling.html)

---

## 1. Project Structure

```
api/
├── src/
│   ├── config/
│   │   ├── database.ts          # MongoDB connection
│   │   ├── env.ts               # Environment validation
│   │   └── cors.ts              # CORS config
│   ├── middleware/
│   │   ├── auth.ts              # JWT auth middleware
│   │   ├── errorHandler.ts      # Global error handler
│   │   ├── validate.ts          # Request validation (Zod)
│   │   ├── rateLimiter.ts       # Rate limiting
│   │   └── logger.ts            # Request logging
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.validation.ts
│   │   ├── users/
│   │   │   ├── user.model.ts
│   │   │   ├── user.routes.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   └── user.validation.ts
│   │   ├── prospects/
│   │   │   ├── prospect.model.ts
│   │   │   ├── prospect.routes.ts
│   │   │   ├── prospect.controller.ts
│   │   │   ├── prospect.service.ts
│   │   │   └── prospect.validation.ts
│   │   └── intros/
│   │       ├── intro.model.ts
│   │       ├── intro.routes.ts
│   │       ├── intro.controller.ts
│   │       ├── intro.service.ts
│   │       └── intro.validation.ts
│   ├── shared/
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── app.ts                   # Express app setup
│   └── server.ts                # Entry point
├── tsconfig.json
└── package.json
```

---

## 2. Mongoose Schema with TypeScript — Automatic Inference (Recommended)

Mongoose 9.x (current) supports automatic type inference. **Do NOT define separate interfaces** — let Mongoose infer types from the schema.

### Basic Model Pattern
```typescript
// modules/users/user.model.ts
import { Schema, model, InferRawDocType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['user', 'admin'] as const,
      default: 'user',
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'microsoft'] as const,
      default: 'local',
    },
    providerId: { type: String },
    avatar: String,
    lastLoginAt: Date,
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
  }
);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ provider: 1, providerId: 1 });

export const User = model('User', userSchema);

// Export inferred type for use elsewhere
export type UserDocument = typeof User extends { prototype: infer T } ? T : never;

// For lean queries (plain objects without Mongoose methods)
export type RawUser = InferRawDocType<typeof userSchema.obj>;
```

### Schema with Methods and Statics
```typescript
// modules/prospects/prospect.model.ts
import { Schema, model, InferRawDocType, Types } from 'mongoose';

const prospectSchema = new Schema(
  {
    linkedinUrl: { type: String, required: true },
    name: { type: String, required: true },
    title: String,
    company: String,
    location: String,
    profileData: { type: Schema.Types.Mixed },
    score: { type: Number, min: 0, max: 100 },
    tags: [{ type: String }],
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: [
      {
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    status: {
      type: String,
      enum: ['new', 'researching', 'ready', 'intro-requested', 'connected'] as const,
      default: 'new',
    },
  },
  { timestamps: true }
);

// Instance methods
prospectSchema.methods.addNote = function (content: string, userId: Types.ObjectId) {
  this.notes.push({ content, createdBy: userId });
  return this.save();
};

// Static methods
prospectSchema.statics.findByCompany = function (company: string) {
  return this.find({ company: new RegExp(company, 'i') });
};

// Indexes
prospectSchema.index({ addedBy: 1, status: 1 });
prospectSchema.index({ linkedinUrl: 1 }, { unique: true });
prospectSchema.index({ name: 'text', company: 'text', title: 'text' });

export const Prospect = model('Prospect', prospectSchema);
```

---

## 3. Database Connection

```typescript
// config/database.ts
import mongoose from 'mongoose';

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI environment variable is required');

  try {
    await mongoose.connect(uri, {
      // Mongoose 9 uses the Node.js driver's defaults which are sensible
      // Only override if needed:
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
}
```

---

## 4. Express App Setup

```typescript
// app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/logger';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/users/user.routes';
import { prospectRoutes } from './modules/prospects/prospect.routes';
import { introRoutes } from './modules/intros/intro.routes';

const app = express();

// ---- Global Middleware ----
app.use(helmet());
app.use(cors({
  origin: [
    process.env.CLIENT_URL || 'http://localhost:5173',
    'chrome-extension://*' // Allow Chrome extension
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ---- Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/prospects', prospectRoutes);
app.use('/api/intros', introRoutes);

// ---- Health Check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Global Error Handler (must be last) ----
app.use(errorHandler);

export { app };
```

---

## 5. Error Handling Pattern

```typescript
// middleware/errorHandler.ts

// Custom error class
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public isOperational = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error factory methods
export const NotFoundError = (resource: string) =>
  new AppError(404, `${resource} not found`, 'NOT_FOUND');

export const ValidationError = (message: string) =>
  new AppError(400, message, 'VALIDATION_ERROR');

export const UnauthorizedError = (message = 'Unauthorized') =>
  new AppError(401, message, 'UNAUTHORIZED');

export const ForbiddenError = (message = 'Forbidden') =>
  new AppError(403, message, 'FORBIDDEN');

// Global error handler middleware
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Mongoose validation error
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => e.message);
    res.status(400).json({
      error: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: errors,
    });
    return;
  }

  // Mongoose duplicate key error
  if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    res.status(409).json({
      error: 'Duplicate entry',
      code: 'DUPLICATE_KEY',
    });
    return;
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: `Invalid ${err.path}: ${err.value}`,
      code: 'CAST_ERROR',
    });
    return;
  }

  // Our custom AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unknown error
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
```

---

## 6. Request Validation with Zod

```typescript
// middleware/validate.ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

// Usage in route validation files:
// modules/prospects/prospect.validation.ts
import { z } from 'zod';

export const createProspectSchema = z.object({
  body: z.object({
    linkedinUrl: z.string().url().includes('linkedin.com'),
    name: z.string().min(1).max(200),
    title: z.string().optional(),
    company: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const updateProspectSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID'),
  }),
  body: z.object({
    title: z.string().optional(),
    company: z.string().optional(),
    score: z.number().min(0).max(100).optional(),
    status: z.enum(['new', 'researching', 'ready', 'intro-requested', 'connected']).optional(),
    tags: z.array(z.string()).optional(),
  }),
});
```

---

## 7. Controller + Service Pattern

```typescript
// modules/prospects/prospect.controller.ts
import { Request, Response, NextFunction } from 'express';
import * as prospectService from './prospect.service';

export async function createProspect(req: Request, res: Response, next: NextFunction) {
  try {
    const prospect = await prospectService.create(req.body, req.user!.id);
    res.status(201).json(prospect);
  } catch (error) {
    next(error);
  }
}

export async function getProspects(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const result = await prospectService.findAll(req.user!.id, {
      page: Number(page),
      limit: Number(limit),
      search: search as string,
      status: status as string,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// modules/prospects/prospect.service.ts
import { Prospect } from './prospect.model';
import { NotFoundError } from '../../middleware/errorHandler';

interface FindAllOptions {
  page: number;
  limit: number;
  search?: string;
  status?: string;
}

export async function create(data: any, userId: string) {
  const prospect = new Prospect({ ...data, addedBy: userId });
  return prospect.save();
}

export async function findAll(userId: string, options: FindAllOptions) {
  const { page, limit, search, status } = options;
  const filter: any = { addedBy: userId };

  if (status) filter.status = status;
  if (search) filter.$text = { $search: search };

  const [prospects, total] = await Promise.all([
    Prospect.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Prospect.countDocuments(filter),
  ]);

  return {
    data: prospects,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function findById(id: string, userId: string) {
  const prospect = await Prospect.findOne({ _id: id, addedBy: userId }).lean();
  if (!prospect) throw NotFoundError('Prospect');
  return prospect;
}
```

---

## 8. Routes

```typescript
// modules/prospects/prospect.routes.ts
import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createProspectSchema, updateProspectSchema } from './prospect.validation';
import * as controller from './prospect.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', validate(createProspectSchema), controller.createProspect);
router.get('/', controller.getProspects);
router.get('/:id', controller.getProspectById);
router.patch('/:id', validate(updateProspectSchema), controller.updateProspect);
router.delete('/:id', controller.deleteProspect);
router.post('/:id/notes', controller.addNote);

export { router as prospectRoutes };
```

---

## 9. Async Handler Wrapper (Alternative)

Instead of `try/catch` in every controller, wrap handlers:

```typescript
// shared/asyncHandler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage in controller:
export const createProspect = asyncHandler(async (req, res) => {
  const prospect = await prospectService.create(req.body, req.user!.id);
  res.status(201).json(prospect);
});
```

---

## 10. Server Entry Point

```typescript
// server.ts
import { app } from './app';
import { connectDatabase } from './config/database';

const PORT = process.env.PORT || 3001;

async function start() {
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`Relay API running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```
