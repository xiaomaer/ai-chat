import assert from 'node:assert/strict';
import test from 'node:test';
import { APICallError, type UIMessage } from 'ai';
import { isChatHistory, messageText, textOnlyHistory } from '../lib/chat';
import { chatErrorMessage } from '../lib/chat-error';
import { CONVERSATIONS_KEY, conversationMarkdown, createConversation, createStore, exportFilename, isConversationStore, loadConversations, updateMessages } from '../lib/conversations';

const user: UIMessage = { id: 'user-1', role: 'user', parts: [{ type: 'text', text: '你好' }] };

test('accepts text conversation and rejects malformed or privileged messages', () => {
  assert.equal(isChatHistory([user]), true);
  for (const value of [null, {}, [null], [{ ...user, role: 'system' }], [{ ...user, parts: [{ type: 'file', url: 'https://example.com' }] }], [{ ...user, parts: [{ type: 'text', text: 123 }] }]]) {
    assert.equal(isChatHistory(value), false);
  }
});

test('stores only visible text, dropping reasoning and incomplete empty replies', () => {
  const assistant: UIMessage = {
    id: 'assistant-1', role: 'assistant', parts: [
      { type: 'step-start' },
      { type: 'reasoning', text: 'private reasoning' },
      { type: 'text', text: '第一段' },
      { type: 'text', text: '第二段' },
    ],
  };
  const history = textOnlyHistory([user, assistant, { id: 'empty', role: 'assistant', parts: [] }]);
  assert.equal(history.length, 2);
  assert.equal(messageText(history[1]), '第一段\n第二段');
  assert.equal(isChatHistory(JSON.parse(JSON.stringify(history))), true);
  assert.equal(JSON.stringify(history).includes('private reasoning'), false);
});

test('API errors show useful messages without exposing upstream credentials', () => {
  const upstream = (statusCode: number) => new APICallError({
    message: 'secret-key-must-not-leak', url: 'https://example.com?key=secret-key-must-not-leak',
    requestBodyValues: {}, statusCode,
  });
  assert.match(chatErrorMessage(upstream(429)), /额度/);
  assert.match(chatErrorMessage(upstream(403)), /地区/);
  assert.match(chatErrorMessage(upstream(404)), /模型/);
  assert.equal(chatErrorMessage(upstream(500)).includes('secret-key'), false);
  assert.equal(chatErrorMessage(new Error('secret-key')).includes('secret-key'), false);
});

test('migrates legacy messages once and prioritizes the versioned conversation store', () => {
  const saved = new Map([['echo-chat:v1', JSON.stringify([user])]]);
  const storage = { getItem: (key: string) => saved.get(key) ?? null };
  const migrated = loadConversations(storage);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.store.conversations[0].title, '你好');
  assert.deepEqual(migrated.store.conversations[0].messages, [user]);
  saved.set(CONVERSATIONS_KEY, JSON.stringify(migrated.store));
  assert.deepEqual(loadConversations(storage), { store: migrated.store, migrated: false });
  saved.set(CONVERSATIONS_KEY, '{broken');
  assert.throws(() => loadConversations(storage));
});

test('rejects invalid active ids, duplicate conversations and malformed saved messages', () => {
  const store = createStore([user]);
  assert.equal(isConversationStore(store), true);
  assert.equal(isConversationStore({ ...store, activeId: 'missing' }), false);
  assert.equal(isConversationStore({ ...store, conversations: [...store.conversations, ...store.conversations] }), false);
  assert.equal(isConversationStore({ ...store, conversations: [{ ...store.conversations[0], messages: [{}] }] }), false);
  assert.equal(isConversationStore({ ...store, conversations: [null] }), false);
});

test('keeps histories isolated and preserves user titles when messages change', () => {
  const store = createStore();
  const second = createConversation();
  store.conversations.push(second);
  const updated = updateMessages(store, store.activeId, [user]);
  assert.equal(updated.conversations[0].title, '你好');
  assert.equal(updated.conversations[1], second);
  assert.equal(updateMessages(updated, store.activeId, [user]), updated);
  updated.conversations[0].title = '自定义标题';
  const again = updateMessages(updated, store.activeId, [user, { ...user, id: 'next', parts: [{ type: 'text', text: '继续' }] }]);
  assert.equal(again.conversations[0].title, '自定义标题');
  assert.equal(again.conversations[1].messages.length, 0);
});

test('exports only the selected conversation as readable Markdown with a safe filename', () => {
  const conversation = createConversation([user, { id: 'reply', role: 'assistant', parts: [{ type: 'text', text: '**你好**\n\n```ts\nconst a = 1;\n```' }] }]);
  const exported = conversationMarkdown(conversation);
  assert.match(exported, /^# 你好/);
  assert.match(exported, /## 你\n\n你好/);
  assert.match(exported, /## 回声\n\n\*\*你好\*\*/);
  assert.match(exported, /```ts\nconst a = 1;/);
  assert.equal(exportFilename('项目/需求:讨论'), '项目_需求_讨论.md');
});
