import assert from 'node:assert/strict';
import test from 'node:test';
import { APICallError, type UIMessage } from 'ai';
import { isChatHistory, messageText, textOnlyHistory } from '../lib/chat';
import { chatErrorMessage } from '../lib/chat-error';

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
