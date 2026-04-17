# React + Vite + Tailwind CSS 4 — Setup Patterns

> Sources: [Tailwind CSS v4 Installation](https://tailwindcss.com/docs), [Tailwind CSS v4.0 Blog](https://tailwindcss.com/blog/tailwindcss-v4), [Vite Guide](https://vite.dev/guide/)

---

## 1. Project Creation

```bash
# Create new Vite + React + TypeScript project
npm create vite@latest relay-web -- --template react-ts
cd relay-web

# Install dependencies
npm install

# Install Tailwind CSS v4 with Vite plugin
npm install tailwindcss @tailwindcss/vite
```

---

## 2. Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

---

## 3. Tailwind CSS v4 Setup

### Key v4 Changes (from v3)
- **No `tailwind.config.js` needed** — CSS-first configuration
- **No `postcss.config.js` needed** when using the Vite plugin
- **No `@tailwind` directives** — just `@import "tailwindcss"`
- **Automatic content detection** — no `content` array to configure
- **CSS theme variables** — customize via `@theme` in CSS
- **First-party Vite plugin** — `@tailwindcss/vite`

### CSS Entry Point
```css
/* src/index.css */
@import "tailwindcss";

/* Custom theme configuration (replaces tailwind.config.js) */
@theme {
  /* Colors */
  --color-primary-50: oklch(0.97 0.02 250);
  --color-primary-100: oklch(0.94 0.04 250);
  --color-primary-200: oklch(0.88 0.08 250);
  --color-primary-300: oklch(0.80 0.12 250);
  --color-primary-400: oklch(0.70 0.16 250);
  --color-primary-500: oklch(0.60 0.20 250);
  --color-primary-600: oklch(0.50 0.20 250);
  --color-primary-700: oklch(0.42 0.18 250);
  --color-primary-800: oklch(0.35 0.15 250);
  --color-primary-900: oklch(0.28 0.12 250);
  --color-primary-950: oklch(0.20 0.08 250);

  /* Fonts */
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  /* Custom breakpoints */
  --breakpoint-xs: 475px;

  /* Animations */
  --animate-fade-in: fade-in 0.3s ease-out;
  --animate-slide-up: slide-up 0.3s ease-out;
}

/* Custom keyframes */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Custom utility classes using @utility */
@utility scrollbar-hidden {
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
```

### Theme Variables as CSS Custom Properties
All `@theme` values are automatically available as CSS variables:
```css
/* These are generated automatically */
:root {
  --color-primary-500: oklch(0.60 0.20 250);
  --font-sans: "Inter", system-ui, -apple-system, sans-serif;
  /* etc. */
}

/* Use anywhere */
.custom-element {
  color: var(--color-primary-500);
  font-family: var(--font-sans);
}
```

---

## 4. Main Entry Point

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

---

## 5. TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

---

## 6. Project Structure (for Relay web / side panel)

```
src/
├── components/
│   ├── ui/                    # Base UI components (Button, Input, Card, etc.)
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── Badge.tsx
│   │   └── Spinner.tsx
│   ├── layout/                # Layout components
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   ├── prospects/             # Feature components
│   │   ├── ProspectCard.tsx
│   │   ├── ProspectList.tsx
│   │   └── ProspectDetail.tsx
│   └── intros/
│       ├── IntroRequestForm.tsx
│       └── IntroStatusBadge.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useProspects.ts
│   └── useAIStream.ts
├── lib/
│   ├── api.ts                 # API client
│   └── utils.ts               # Utility functions
├── types/
│   └── index.ts
├── App.tsx
├── main.tsx
└── index.css
```

---

## 7. Component Patterns with Tailwind v4

### Button Component
```tsx
// components/ui/Button.tsx
import { ButtonHTMLAttributes, forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
  ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-lg font-medium
        transition-colors duration-150
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
```

### Card Component
```tsx
// components/ui/Card.tsx
import { HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ padding = 'md', className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`rounded-xl border border-gray-200 bg-white shadow-sm ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';
```

---

## 8. Dark Mode with Tailwind v4

Tailwind v4 supports dark mode via the `dark:` variant (uses `prefers-color-scheme` by default):

```css
/* index.css — opt into class-based dark mode */
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));
```

```tsx
// Usage
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <Card className="border-gray-200 dark:border-gray-700">
    Content
  </Card>
</div>
```

---

## 9. Chrome Extension Side Panel with React + Vite

For the extension's side panel, use a **separate Vite build config**:

```typescript
// vite.sidepanel.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'dist/sidepanel',
    rollupOptions: {
      input: 'src/sidepanel/index.html',
    },
  },
});
```

Or use a Chrome extension Vite plugin like `@crxjs/vite-plugin` which handles multiple entry points automatically.

---

## 10. Key Tailwind v4 Utility Changes

| v3 | v4 | Notes |
|---|---|---|
| `bg-opacity-50` | `bg-blue-500/50` | Opacity modifier syntax |
| `ring-2 ring-blue-500` | `ring-2 ring-blue-500` | Same, but also `inset-ring-*` available |
| `bg-gradient-to-r` | `bg-linear-to-r` | Renamed, plus `bg-conic-*`, `bg-radial-*` |
| `blur-sm` | `blur-sm` | Same |
| Container queries | `@container` + `@sm:` | Built-in, no plugin needed |
| `tailwind.config.js` | `@theme {}` in CSS | CSS-first config |
| `content: ['./src/**/*.{ts,tsx}']` | Automatic | Detects from `.gitignore` |
