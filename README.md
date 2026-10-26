# Echo · Next.js Chat Demo

A chat interface built with Next.js App Router, React, and the Vercel AI SDK, using the existing Gemini 3.1 Flash-Lite configuration.

## Run locally

Requires Node.js 22 or later.

```bash
npm install
```

Configure the API key in the project root `.env` file. Existing configuration can be reused:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
```

```bash
npm run dev
```

Open http://localhost:3000. The key is read on the server and is never sent to the browser. The original `index.ts` is preserved; run the command-line example with `npm run demo`.

## Features

- Send messages with multi-turn context and real-time streaming responses.
- Enter to send, Shift + Enter for a new line, and Chinese IME support.
- Stop generation, retry failed requests, and render Markdown and code blocks.
- Store the conversation in the current browser's localStorage and restore it after refresh. Clearing the conversation also updates the saved history.
- Save history when generation finishes or stops. Closing the page during generation may discard the incomplete response.
- Responsive layout and support for reduced-motion preferences.

Each request sends the current conversation to Gemini as context. Local storage does not mean offline inference and does not synchronize across devices. The page shows a warning if browser storage is unavailable or full.

## Project structure

- `app/api/chat/route.ts`: validate requests, call Gemini, and return streaming responses.
- `components/`: chat workspace, message list, and composer.
- `hooks/use-conversation.ts`: chat state and browser persistence.
- `lib/chat.ts`: model configuration, history validation, and text conversion.
- `lib/chat-error.ts`: user-facing model error messages.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

If Chromium is missing before the first browser test run, install it with `npx playwright install chromium`. Browser tests simulate model responses and do not consume real API quota.

Gemini's free quota, supported regions, and available models depend on your Google account and the platform's policies. This is a local development demo; add authentication and request limits before public deployment.
