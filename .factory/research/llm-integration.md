# LLM Integration — Vercel AI SDK Multi-Provider Patterns

> Sources: [AI SDK Docs](https://ai-sdk.dev/docs), [Provider Registry](https://ai-sdk.dev/docs/reference/ai-sdk-core/provider-registry), [Provider Management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management), [Vercel AI SDK Overview](https://vercel.com/docs/ai-sdk)

---

## 1. Package Setup

```bash
# Core AI SDK
npm install ai

# Provider packages
npm install @ai-sdk/openai @ai-sdk/anthropic

# For structured output
npm install zod
```

Current version: **AI SDK 6.x** (latest as of 2026).

---

## 2. Core API — Unified Interface

The AI SDK provides a unified API for all providers. Switch providers by changing the model string.

### generateText — Non-streaming
```typescript
import { generateText } from 'ai';

const { text } = await generateText({
  model: 'openai/gpt-4o',
  prompt: 'Write a professional intro request for a sales meeting.',
});
```

### streamText — Streaming Responses
```typescript
import { streamText } from 'ai';

const result = streamText({
  model: 'anthropic/claude-sonnet-4-5',
  prompt: 'Analyze this prospect profile and suggest talking points.',
});

// Node.js / Express streaming
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// Or pipe to Express response
app.post('/api/ai/stream', async (req, res) => {
  const result = streamText({
    model: 'openai/gpt-4o',
    messages: req.body.messages,
  });
  result.pipeTextStreamToResponse(res);
});
```

### generateObject — Structured Output with Zod
```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const { object } = await generateObject({
  model: 'openai/gpt-4o',
  schema: z.object({
    prospectScore: z.number().min(0).max(100),
    talkingPoints: z.array(z.string()),
    suggestedApproach: z.enum(['warm-intro', 'cold-outreach', 'event-follow-up']),
    connectionPaths: z.array(z.object({
      name: z.string(),
      relationship: z.string(),
      strength: z.enum(['strong', 'moderate', 'weak']),
    })),
  }),
  prompt: `Analyze this prospect: ${JSON.stringify(prospectData)}`,
});
```

---

## 3. Provider Registry — Multi-Provider Management

Central management of providers with simple string IDs.

### Setup
```typescript
// lib/ai/registry.ts
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createProviderRegistry } from 'ai';

export const registry = createProviderRegistry({
  // Register with prefix and default setup
  anthropic,
  
  // Register with prefix and custom setup
  openai: createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
});

// Usage: registry.languageModel('openai:gpt-4o')
// Usage: registry.languageModel('anthropic:claude-sonnet-4-5')
```

### Usage with generateText
```typescript
import { generateText } from 'ai';
import { registry } from './registry';

const { text } = await generateText({
  model: registry.languageModel('openai:gpt-4o'),
  prompt: 'Generate intro request email',
});
```

---

## 4. Custom Provider — Aliases & Pre-configured Settings

```typescript
// lib/ai/provider.ts
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { customProvider, wrapLanguageModel, defaultSettingsMiddleware } from 'ai';

// Create provider with model aliases
export const relayAI = customProvider({
  languageModels: {
    // Fast model for quick tasks (autocomplete, classification)
    fast: openai('gpt-4o-mini'),

    // Default model for general tasks
    default: openai('gpt-4o'),

    // High quality model for important content generation
    quality: anthropic('claude-sonnet-4-5'),

    // Reasoning model for complex analysis
    reasoning: wrapLanguageModel({
      model: openai('o3-mini'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: { reasoningEffort: 'high' },
          },
        },
      }),
    }),
  },
  // Fallback to openai for any unregistered model
  fallbackProvider: openai,
});
```

### Usage
```typescript
import { generateText } from 'ai';
import { relayAI } from './provider';

// Use alias
const { text } = await generateText({
  model: relayAI.languageModel('fast'),
  prompt: 'Classify this message intent',
});

// Use quality model for important tasks
const { text: email } = await generateText({
  model: relayAI.languageModel('quality'),
  prompt: 'Draft a professional intro request email',
});
```

---

## 5. Streaming in Express API

### Server-Side Streaming Endpoint
```typescript
// routes/ai.ts
import { streamText } from 'ai';
import { relayAI } from '../lib/ai/provider';

router.post('/ai/generate-intro', authenticate, async (req, res) => {
  const { prospectData, context, modelTier = 'default' } = req.body;

  try {
    const result = streamText({
      model: relayAI.languageModel(modelTier),
      system: `You are a sales assistant helping draft intro requests.
               Be professional, concise, and personalized.`,
      messages: [
        {
          role: 'user',
          content: `Draft an intro request for: ${JSON.stringify(prospectData)}
                    Context: ${context}`,
        },
      ],
      maxTokens: 1000,
    });

    // Stream back to client
    result.pipeTextStreamToResponse(res);
  } catch (error) {
    res.status(500).json({ error: 'AI generation failed' });
  }
});
```

### Client-Side Consumption (in Chrome Extension Side Panel)
```typescript
// sidepanel/hooks/useAIStream.ts
export function useAIStream() {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const generate = async (endpoint: string, body: any) => {
    setIsStreaming(true);
    setText('');

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`,
      },
      body: JSON.stringify(body),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error('No reader available');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      setText(prev => prev + chunk);
    }

    setIsStreaming(false);
  };

  return { text, isStreaming, generate };
}
```

---

## 6. Tool Calling

```typescript
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { relayAI } from './provider';

const { text } = await generateText({
  model: relayAI.languageModel('default'),
  prompt: 'Find connections to John Smith at Acme Corp',
  tools: {
    searchConnections: tool({
      description: 'Search for mutual connections with a prospect',
      parameters: z.object({
        prospectName: z.string(),
        company: z.string(),
      }),
      execute: async ({ prospectName, company }) => {
        // Query your database for connection paths
        const connections = await db.findConnectionPaths(prospectName, company);
        return connections;
      },
    }),
    getCompanyInfo: tool({
      description: 'Get information about a company',
      parameters: z.object({
        companyName: z.string(),
      }),
      execute: async ({ companyName }) => {
        return await db.getCompanyProfile(companyName);
      },
    }),
  },
});
```

---

## 7. Error Handling

```typescript
import { generateText, APICallError, TypeValidationError } from 'ai';

try {
  const { text } = await generateText({
    model: relayAI.languageModel('default'),
    prompt: 'Generate intro email',
  });
} catch (error) {
  if (error instanceof APICallError) {
    // Handle rate limits, auth errors, etc.
    console.error('API call failed:', error.statusCode, error.message);
    if (error.statusCode === 429) {
      // Implement retry with backoff
    }
  } else if (error instanceof TypeValidationError) {
    // Schema validation failed (for generateObject)
    console.error('Output validation failed:', error.message);
  } else {
    throw error;
  }
}
```

---

## 8. Key Architecture Decisions for Relay

1. **Provider registry** lives server-side only — API keys never reach the extension
2. **Model selection** is by use case alias (fast/default/quality/reasoning), not model name
3. **Streaming** uses `streamText` + `pipeTextStreamToResponse` for real-time UX
4. **Structured output** with `generateObject` + Zod for prospect analysis, scoring, etc.
5. **Tool calling** for connecting AI to database queries (connection search, company lookup)
6. All AI calls go through the Express API — the Chrome extension never calls LLM APIs directly
