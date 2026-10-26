# Echo · Personal Next.js Chat Assistant

Built with the Next.js App Router, React, and the Vercel AI SDK, using Gemini 3.1 Flash-Lite. This personal edition stores multiple conversations in the current browser and requires no database or login.

## Local development

Node.js 22 or later is required.

```bash
npm install
```

Set your API key in `.env` at the project root. Existing configuration can be reused:

```dotenv
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key
```

```bash
npm run dev
```

Open http://localhost:3000. The API key is read on the server and is never sent to the browser. The original `index.ts` is retained; run `npm run demo` to use the command-line example.

## Personal conversation management

- The sidebar lists conversations by their most recent message update. On mobile, open the list using the menu button in the header.
- Creating a conversation preserves existing conversations. Repeatedly clicking New reuses an empty conversation that has no messages yet.
- Each conversation has its own ID, title, creation time, update time, and message history. Requests include only the active conversation's context.
- The first question becomes the conversation title automatically. Use the pencil button in the header to open an in-page rename dialog, with a maximum title length of 60 characters. It supports saving, canceling, empty-title validation, and closing with Escape, including in embedded browsers that do not support native browser input prompts.
- Export the current conversation as Markdown from the header, including user messages, model replies, and code blocks. Exports are intended for reading and backups; importing them to restore conversations is not currently supported.
- Delete removes only the active conversation after confirmation. Deleting the last conversation creates an empty one.
- Refreshing restores the conversation list and the last selected conversation. Creating, switching, renaming, deleting, and exporting conversations are disabled during generation and become available again when generation stops or finishes.
- Legacy single-conversation history is migrated automatically. The legacy storage key is removed only after the new format has been saved successfully, preserving history if migration fails.

## Chat features

- Multi-turn context, streamed replies, Markdown rendering, and code blocks.
- A copy button below each AI reply copies its complete Markdown, including code blocks. Stop generation or wait for completion before copying a reply that is still being generated. A brief confirmation appears after copying, and failures show instructions for manual copying.
- Enter sends a message; Shift + Enter inserts a newline. Chinese input methods are supported.
- Stop generation, retry failed requests, mobile layouts, and reduced-motion preferences.
- User messages are saved after sending, and replies are saved when generation finishes or stops. Closing the page during generation may leave an unfinished reply unsaved.

## Data storage

Conversation history is stored in localStorage under `echo-conversations:v2`; the legacy key is `echo-chat:v1`. Records belong to the current browser and site address and do not sync across browsers, devices, domains, or ports. Clearing site data deletes the records, so export important content first. This edition does not support real-time coordination across browser tabs; manage conversations in a single tab.

If existing records cannot be read, the application preserves the original stored data and temporarily continues chatting in memory. Storage quota errors and other write failures also display a warning. In these cases, export any content you need before leaving or refreshing the page.

Each message request sends the active conversation to Gemini as context. Local storage does not mean offline inference. Gemini's free quota, supported regions, and available models depend on the Google account and platform rules. This project is a personal local development example; add authentication and usage limits before making it publicly available to multiple users.

## Project structure

- `app/api/chat/route.ts`: Validates requests, calls Gemini, and returns streaming responses.
- `components/`: Chat workspace, conversation list, message list, and composer.
- `hooks/use-conversation.ts`: Conversation switching, browser persistence, renaming, deletion, and export.
- `lib/conversations.ts`: Multi-conversation storage format, legacy history migration, title generation, and Markdown export.
- `lib/chat.ts`: Model name, message validation, and text conversion.
- `lib/chat-error.ts`: Chinese messages for model errors.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

If Chromium is missing when running browser tests for the first time, run `npx playwright install chromium`. Browser tests mock model responses and do not consume actual API quota.
