import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const requests: unknown[] = [];
    Object.assign(window, { chatTestRequests: requests });
    window.fetch = async (input, init) => {
      if (!String(input).endsWith('/api/chat')) return originalFetch(input, init);
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      const text = body.messages.at(-1).parts[0].text as string;
      const controls = window as unknown as { chatTestNextResponse?: { first?: string; last?: string; delay?: number; failure?: 'http' | 'stream' | 'disconnect' } };
      const next = controls.chatTestNextResponse;
      delete controls.chatTestNextResponse;
      if (next?.failure === 'http') return new Response('模拟请求失败', { status: 503 });
      if (text === '模拟失败' && requests.length === 1) {
        return new Response('当前模型的调用额度已用完或请求过于频繁，请稍后重试。', { status: 429 });
      }
      const events: Record<string, string>[] = [
        { type: 'start', messageId: `reply-${crypto.randomUUID()}` },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: next?.first ?? '这是**流式回复**的第一部分。' },
        { type: 'text-delta', id: 'text-1', delta: next?.last ?? '\n\n```typescript\nconst hello = "你好";\n```\n\n回复已完成。' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason: 'stop' },
      ];
      if (next?.failure === 'stream') events.splice(3, events.length - 3, { type: 'error', errorText: '模拟流式中断' });
      let timer: ReturnType<typeof setInterval>;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          let index = 0;
          const abort = () => { clearInterval(timer); controller.error(new DOMException('Aborted', 'AbortError')); };
          init?.signal?.addEventListener('abort', abort, { once: true });
          timer = setInterval(() => {
            if (next?.failure === 'disconnect' && index === 3) {
              clearInterval(timer);
              controller.error(new TypeError('Failed to fetch'));
              return;
            }
            if (index < events.length) controller.enqueue(encoder.encode(`data: ${JSON.stringify(events[index++])}\n\n`));
            else {
              clearInterval(timer);
              init?.signal?.removeEventListener('abort', abort);
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }, next?.delay ?? (text === '慢速回复' ? 400 : 60));
        },
        cancel() { clearInterval(timer); },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' } });
    };
  });
});

test('streams Markdown, sends multi-turn context and restores browser history', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox', { name: '输入消息' });
  await expect(page.getByRole('button', { name: '发送消息' })).toBeDisabled();
  await input.fill('你好');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
  await expect(page.locator('.markdown strong')).toHaveText('流式回复');
  await expect(page.locator('.markdown pre')).toContainText('const hello');
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await input.fill('请继续');
  await input.press('Enter');
  await expect(page.locator('.message-assistant')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  const requests = await page.evaluate(() => (window as unknown as { chatTestRequests: { messages: { role: string }[] }[] }).chatTestRequests);
  expect(requests[1].messages.map(message => message.role)).toEqual(['user', 'assistant', 'user']);
  await page.reload();
  await expect(page.locator('.message-user')).toHaveCount(2);
  await expect(page.locator('.message-assistant')).toHaveCount(2);
});

test('stops a partial response and allows another message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('慢速回复');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.locator('.markdown')).toContainText('第一部分');
  await expect(page.getByRole('button', { name: '复制回复' })).toBeDisabled();
  await page.getByRole('button', { name: '停止生成' }).click();
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(page.locator('.markdown')).not.toContainText('回复已完成');
  await page.getByRole('textbox').fill('继续');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.locator('.message-assistant')).toHaveCount(2);
});

test('displays API errors and retries without duplicating the user message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox').fill('模拟失败');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.getByRole('alert', { name: '发送失败' })).toContainText('调用额度');
  await page.getByRole('button', { name: '重新尝试' }).click();
  await expect(page.locator('.markdown')).toContainText('回复已完成');
  await expect(page.locator('.message-user')).toHaveCount(1);
  await expect(page.getByRole('alert', { name: '发送失败' })).toHaveCount(0);
});

test('preserves Chinese IME Enter and Shift+Enter, and confirms deleting history', async ({ page }) => {
  await page.goto('/');
  const input = page.getByRole('textbox');
  await input.fill('中文输入');
  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  await expect(page.locator('.message-user')).toHaveCount(0);
  await input.dispatchEvent('compositionend');
  await input.fill('中文输入');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('中文输入\n');
  await input.press('Enter');
  await expect(page.locator('.markdown')).toContainText('回复已完成');
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '删除当前会话' }).click();
  await expect(page.locator('.message-user')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除当前会话' }).click();
  await expect(page.getByRole('heading', { name: /今天有什么/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('.message-user')).toHaveCount(0);
});

test('mobile layout has no horizontal overflow and suggestions send a message', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('textbox')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: /把复杂的事说简单/ }).click();
  await expect(page.locator('.message-user')).toContainText('大语言模型');
  await expect(page.locator('.markdown')).toContainText('回复已完成');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('recovers from corrupted local storage', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('echo-chat:v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('记录无法读取');
  await expect(page.getByRole('textbox')).toBeEnabled();
});

test('route rejects malformed messages before calling the provider', async ({ request }) => {
  const response = await request.post('/api/chat', { data: { messages: [{ id: 'bad', role: 'system', parts: [{ type: 'text', text: 'invalid' }] }] } });
  expect(response.status()).toBe(400);
  const broken = await request.post('/api/chat', { data: 'not-json', headers: { 'Content-Type': 'application/json' } });
  expect(broken.status()).toBe(400);
});

async function send(page: Page, text: string) {
  await page.getByRole('textbox', { name: '输入消息' }).fill(text);
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
}

test('keeps independent conversations and active selection after refresh', async ({ page }) => {
  await page.goto('/');
  await send(page, '第一段对话');
  await page.getByRole('button', { name: '开启新对话' }).click();
  await expect(page.getByRole('heading', { name: /今天有什么/ })).toBeVisible();
  await send(page, '第二段对话');
  await expect(page.getByRole('button', { name: '切换到：第一段对话' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.user-text')).toHaveText('第二段对话');
  await page.getByRole('button', { name: '切换到：第一段对话' }).click();
  await expect(page.locator('.user-text')).toHaveText('第一段对话');
  await send(page, '继续第一段');
  const requests = await page.evaluate(() => (window as unknown as { chatTestRequests: { messages: { parts: { text: string }[] }[] }[] }).chatTestRequests);
  expect(requests[0].messages).toHaveLength(3);
  expect(JSON.stringify(requests[0])).not.toContain('第二段对话');
  await page.reload();
  await expect(page.getByRole('button', { name: '切换到：第一段对话' })).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.message-user')).toHaveCount(2);
  await page.getByRole('textbox').fill('尚未发送的草稿');
  await page.getByRole('button', { name: '切换到：第一段对话' }).click();
  await expect(page.getByRole('textbox')).toHaveValue('尚未发送的草稿');
  await page.getByRole('button', { name: '开启新对话' }).click();
  await page.getByRole('button', { name: '开启新对话' }).click();
  await expect(page.getByRole('navigation', { name: '会话列表' }).getByRole('button')).toHaveCount(3);
});

test('migrates existing history without duplication or resurrecting deleted legacy messages', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.removeItem('echo-conversations:v2');
    localStorage.setItem('echo-chat:v1', JSON.stringify([
      { id: 'old-user', role: 'user', parts: [{ type: 'text', text: '旧版问题' }] },
      { id: 'old-assistant', role: 'assistant', parts: [{ type: 'text', text: '旧版回答' }] },
    ]));
  });
  await page.reload();
  await expect(page.locator('.message-assistant')).toContainText('旧版回答');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('echo-chat:v1'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('navigation', { name: '会话列表' }).getByRole('button')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除当前会话' }).click();
  await page.reload();
  await expect(page.locator('.message-user')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '切换到：旧版问题' })).toHaveCount(0);
});

test('renames, exports and deletes only the selected conversation', async ({ page }) => {
  await page.goto('/');
  await send(page, '保留的对话');
  await page.getByRole('button', { name: '开启新对话' }).click();
  await send(page, '准备导出的对话');
  await page.getByRole('button', { name: '重命名当前会话' }).click();
  const rename = page.getByRole('dialog', { name: '重命名会话', exact: true });
  await rename.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('button', { name: '切换到：准备导出的对话' })).toBeVisible();
  await page.getByRole('button', { name: '重命名当前会话' }).click();
  await rename.getByRole('textbox', { name: '会话名称' }).fill('   ');
  await rename.getByRole('button', { name: '保存', exact: true }).click();
  await expect(rename.getByRole('alert')).toContainText('请输入会话名称');
  await rename.getByRole('textbox', { name: '会话名称' }).fill('项目/灵感');
  await rename.getByRole('button', { name: '保存', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '项目/灵感', exact: true })).toBeVisible();
  await send(page, '重命名后继续');
  await expect(page.getByRole('heading', { name: '项目/灵感', exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前会话' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('项目_灵感.md');
  const markdown = await readFile((await download.path())!, 'utf8');
  expect(markdown).toContain('# 项目/灵感');
  expect(markdown).toContain('准备导出的对话');
  expect(markdown).toContain('```typescript');
  expect(markdown).not.toContain('保留的对话');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('textbox').fill('删除时的草稿');
  await page.getByRole('button', { name: '删除当前会话' }).click();
  await expect(page.getByRole('heading', { name: '项目/灵感', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue('删除时的草稿');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除当前会话' }).click();
  await expect(page.locator('.user-text')).toHaveText('保留的对话');
  await expect(page.getByRole('textbox')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('button', { name: '切换到：项目/灵感' })).toHaveCount(0);
  await expect(page.locator('.user-text')).toHaveText('保留的对话');
});

test('blocks conversation changes during streaming and saves the stopped reply to its conversation', async ({ page }) => {
  await page.goto('/');
  await send(page, '已经保存的对话');
  await page.getByRole('button', { name: '开启新对话' }).click();
  await page.getByRole('textbox').fill('慢速回复');
  await page.getByRole('button', { name: '发送消息' }).click();
  await expect(page.getByRole('button', { name: '开启新对话' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '切换到：已经保存的对话' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '删除当前会话' })).toBeDisabled();
  await expect(page.locator('.markdown')).toContainText('第一部分');
  await expect(page.getByRole('button', { name: '复制回复' })).toBeDisabled();
  await page.getByRole('button', { name: '停止生成' }).click();
  await page.getByRole('button', { name: '切换到：已经保存的对话' }).click();
  await expect(page.locator('.user-text')).toHaveText('已经保存的对话');
  await page.getByRole('button', { name: '切换到：慢速回复' }).click();
  await page.reload();
  await expect(page.locator('.markdown')).toContainText('第一部分');
  await expect(page.locator('.markdown')).not.toContainText('回复已完成');
});

test('mobile history dialog switches conversations and restores focus when closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await send(page, '手机会话一');
  await page.getByRole('button', { name: '开启新对话' }).click();
  await send(page, '手机会话二');
  const opener = page.getByRole('button', { name: '打开会话列表' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '我的对话' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '切换到：手机会话一' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.user-text')).toHaveText('手机会话一');
  await expect(opener).toBeFocused();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('preserves unreadable records and allows exporting in-memory conversations', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('echo-conversations:v2', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('原记录未被覆盖');
  await send(page, '仅在内存中的对话');
  expect(await page.evaluate(() => localStorage.getItem('echo-conversations:v2'))).toBe('{broken');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前会话' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('仅在内存中的对话.md');
});

test('keeps legacy records when saving a migration fails', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('echo-chat:v1', JSON.stringify([{ id: 'old', role: 'user', parts: [{ type: 'text', text: '空间不足时的旧记录' }] }]));
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'echo-conversations:v2') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('记录无法保存');
  await expect(page.locator('.message-user')).toContainText('空间不足时的旧记录');
  expect(await page.evaluate(() => localStorage.getItem('echo-chat:v1'))).toContain('空间不足时的旧记录');
  await expect(page.getByRole('button', { name: '导出当前会话' })).toBeEnabled();
});

test('renames inside the page when browser prompt is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    window.prompt = () => { throw new Error('prompt() is not supported.'); };
  });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: '重命名当前会话' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '重命名会话', exact: true });
  await expect(dialog).toBeVisible();
  const title = dialog.getByRole('textbox', { name: '会话名称' });
  await expect(title).toHaveValue('新对话');
  await expect(title).toBeFocused();
  await title.fill('   ');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect(dialog.getByRole('alert')).toContainText('请输入会话名称');
  await title.fill('内置浏览器编辑验证');
  await title.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.getByRole('heading', { name: '内置浏览器编辑验证', exact: true })).toBeVisible();
  await trigger.click();
  await title.fill('取消修改');
  await title.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: '内置浏览器编辑验证', exact: true })).toBeVisible();
});

test('copies the selected assistant reply as complete Markdown', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const first = '第一条 **回复**\n\n```ts\nconst value = 1;\n```';
  const second = '第二条回复，内容独立。';
  await page.addInitScript(({ first, second }) => {
    localStorage.setItem('echo-chat:v1', JSON.stringify([
      { id: 'question', role: 'user', parts: [{ type: 'text', text: '用户的问题不应被复制' }] },
      { id: 'first', role: 'assistant', parts: [{ type: 'text', text: first }] },
      { id: 'second', role: 'assistant', parts: [{ type: 'text', text: second }] },
    ]));
  }, { first, second });
  await page.goto('/');
  const replies = page.locator('.message-assistant');
  await expect(replies).toHaveCount(2);
  await expect(page.locator('.message-user').getByRole('button', { name: '复制回复' })).toHaveCount(0);
  await replies.nth(0).getByRole('button', { name: '复制回复' }).click();
  await expect(replies.nth(0).getByRole('status')).toHaveText('回复已复制到剪贴板。');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);
  await replies.nth(1).getByRole('button', { name: '复制回复' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(second);
});

test('copies through the compatibility path when the Clipboard API is unavailable', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await send(page, '复制兼容验证');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
  const button = page.getByRole('button', { name: '复制回复' });
  await button.click();
  await expect(page.locator('.message-assistant').getByRole('status')).toHaveText('回复已复制到剪贴板。');
  await expect(button).toBeFocused();
  await page.evaluate(() => Reflect.deleteProperty(navigator, 'clipboard'));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('这是**流式回复**的第一部分。');
  expect(copied).toContain('```typescript\nconst hello = "你好";');
});

test('shows copy failures and allows retry instead of claiming success', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await send(page, '复制失败验证');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) }, configurable: true });
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
  });
  const button = page.getByRole('button', { name: '复制回复' });
  await button.click();
  await expect(page.locator('.message-assistant').getByRole('status')).toContainText('复制失败');
  await expect(page.locator('.message-assistant').getByRole('status')).not.toContainText('已复制');
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(document, 'execCommand');
  });
  await button.click();
  await expect(page.locator('.message-assistant').getByRole('status')).toHaveText('回复已复制到剪贴板。');
});

test('mobile rename dialog fits the viewport and respects IME composition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '重命名当前会话' }).click();
  const dialog = page.getByRole('dialog', { name: '重命名会话', exact: true });
  const name = dialog.getByRole('textbox', { name: '会话名称' });
  await name.fill('输入中的名称');
  await name.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(dialog).toBeVisible();
  expect(await name.getAttribute('maxlength')).toBe('60');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: '输入中的名称', exact: true })).toBeVisible();
});

async function nextReply(page: Page, response: { first?: string; last?: string; delay?: number; failure?: 'http' | 'stream' | 'disconnect' }) {
  await page.evaluate(response => Object.assign(window, { chatTestNextResponse: response }), response);
}

async function savedConversations(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('echo-conversations:v2')!));
}

async function editQuestion(page: Page, text: string) {
  await page.getByRole('button', { name: '编辑最后一条问题', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑最后一条问题', exact: true });
  await editor.getByRole('textbox', { name: '问题内容' }).fill(text);
  await editor.getByRole('button', { name: '重新发送', exact: true }).click();
  await expect(editor).not.toBeVisible();
}

test('edits only the latest question and preserves earlier context across refresh', async ({ page }) => {
  await page.goto('/');
  await send(page, '第一轮问题');
  await send(page, '最后一轮旧问题');
  const before = await savedConversations(page);
  await expect(page.getByRole('button', { name: '编辑最后一条问题', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '重新生成最后一条回复' })).toHaveCount(1);
  await expect(page.locator('.message-user').first().getByRole('button')).toHaveCount(0);
  await nextReply(page, { first: '针对修改后问题的回答', last: '' });
  await editQuestion(page, '最后一轮新问题');
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(page.locator('.user-text')).toHaveText(['第一轮问题', '最后一轮新问题']);
  await expect(page.locator('.markdown').last()).toHaveText('针对修改后问题的回答');
  const request = await page.evaluate(() => (window as unknown as { chatTestRequests: { messages: { parts: { text: string }[] }[] }[] }).chatTestRequests.at(-1)!);
  expect(request.messages).toHaveLength(3);
  expect(request.messages.slice(0, 2)).toEqual(before.conversations[0].messages.slice(0, 2));
  expect(request.messages.at(-1)!.parts[0].text).toBe('最后一轮新问题');
  await page.reload();
  await expect(page.locator('.user-text')).toHaveText(['第一轮问题', '最后一轮新问题']);
  await expect(page.locator('.markdown').last()).toHaveText('针对修改后问题的回答');
});

test('regenerates only the latest reply without duplicating its question', async ({ page }) => {
  await page.goto('/');
  await send(page, '第一轮问题');
  await send(page, '第二轮问题');
  const before = await savedConversations(page);
  await nextReply(page, { first: '重新生成的新答案', last: '' });
  await page.getByRole('button', { name: '重新生成最后一条回复' }).click();
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(page.locator('.user-text')).toHaveText(['第一轮问题', '第二轮问题']);
  await expect(page.locator('.markdown').last()).toHaveText('重新生成的新答案');
  const request = await page.evaluate(() => (window as unknown as { chatTestRequests: { messages: unknown[] }[] }).chatTestRequests.at(-1)!);
  expect(request.messages).toEqual(before.conversations[0].messages.slice(0, -1));
  await page.reload();
  await expect(page.locator('.message-assistant')).toHaveCount(2);
  await expect(page.locator('.markdown').last()).toHaveText('重新生成的新答案');
});

test('restores a failed edit and retries the edited question rather than the original', async ({ page }) => {
  await page.goto('/');
  await send(page, '原问题');
  const before = await savedConversations(page);
  await nextReply(page, { failure: 'http' });
  await editQuestion(page, '修改后失败的问题');
  await expect(page.getByRole('alert', { name: '发送失败' })).toContainText('原问题和回复已恢复');
  await expect(page.locator('.user-text')).toHaveText('原问题');
  await expect(page.locator('.markdown')).toContainText('回复已完成');
  expect(await savedConversations(page)).toEqual(before);
  await nextReply(page, { first: '编辑重试成功', last: '' });
  await page.getByRole('button', { name: '重新尝试' }).click();
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(page.locator('.user-text')).toHaveText('修改后失败的问题');
  await expect(page.locator('.markdown')).toHaveText('编辑重试成功');
  const question = await page.evaluate(() => (window as unknown as { chatTestRequests: { messages: { parts: { text: string }[] }[] }[] }).chatTestRequests.at(-1)!.messages.at(-1)!.parts[0].text);
  expect(question).toBe('修改后失败的问题');
  await page.reload();
  await expect(page.locator('.user-text')).toHaveText('修改后失败的问题');
});

for (const failure of ['stream', 'disconnect'] as const) {
  test(`restores the original reply after a ${failure} failure during regeneration`, async ({ page }) => {
    await page.goto('/');
    await send(page, '保留原答案的问题');
    const before = await savedConversations(page);
    await nextReply(page, { first: '不应保留的不完整新答案', failure });
    await page.getByRole('button', { name: '重新生成最后一条回复' }).click();
    await expect(page.getByRole('alert', { name: '发送失败' })).toContainText('原问题和回复已恢复');
    await expect(page.locator('.markdown')).toContainText('回复已完成');
    await expect(page.locator('.markdown')).not.toContainText('不应保留');
    expect(await savedConversations(page)).toEqual(before);
    await page.reload();
    await expect(page.locator('.user-text')).toHaveText('保留原答案的问题');
    await expect(page.locator('.markdown')).toContainText('回复已完成');
  });
}

for (const operation of ['edit', 'regenerate'] as const) {
  test(`keeps saved history intact during ${operation} and persists a deliberately stopped reply`, async ({ page }) => {
    await page.goto('/');
    await send(page, '保留的其他会话');
    await page.getByRole('button', { name: '开启新对话' }).click();
    await send(page, '待更新的问题');
    const before = await savedConversations(page);
    await nextReply(page, { first: '主动停止时保留的新内容', last: '不应生成到这里', delay: 400 });
    if (operation === 'edit') await editQuestion(page, '修改后的问题');
    else await page.getByRole('button', { name: '重新生成最后一条回复' }).click();
    await expect(page.locator('.markdown')).toContainText('主动停止时保留的新内容');
    await expect(page.getByRole('button', { name: '编辑最后一条问题', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '重新生成最后一条回复' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '切换到：保留的其他会话' })).toBeDisabled();
    expect(await savedConversations(page)).toEqual(before);
    await page.getByRole('button', { name: '停止生成' }).click();
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.markdown')).toHaveText('主动停止时保留的新内容');
    await expect(page.locator('.user-text')).toHaveText(operation === 'edit' ? '修改后的问题' : '待更新的问题');
    await page.getByRole('button', { name: '切换到：保留的其他会话' }).click();
    await expect(page.locator('.user-text')).toHaveText('保留的其他会话');
    await expect(page.locator('.markdown')).toContainText('回复已完成');
  });
}

test('refresh during an unfinished edit restores the saved original turn', async ({ page }) => {
  await page.goto('/');
  await send(page, '刷新前的原问题');
  const before = await savedConversations(page);
  await nextReply(page, { first: '生成中的替换内容', delay: 500 });
  await editQuestion(page, '尚未完成的新问题');
  await expect(page.locator('.markdown')).toContainText('生成中的替换内容');
  await page.reload();
  await expect(page.locator('.user-text')).toHaveText('刷新前的原问题');
  await expect(page.locator('.markdown')).toContainText('回复已完成');
  expect(await savedConversations(page)).toEqual(before);
});

test('clears failed edit retries when switching conversations', async ({ page }) => {
  await page.goto('/');
  await send(page, '会话甲');
  await page.getByRole('button', { name: '开启新对话' }).click();
  await send(page, '会话乙');
  await nextReply(page, { failure: 'http' });
  await editQuestion(page, '乙的失败修改');
  await expect(page.getByRole('alert', { name: '发送失败' })).toBeVisible();
  await page.getByRole('button', { name: '切换到：会话甲' }).click();
  await expect(page.getByRole('alert', { name: '发送失败' })).toHaveCount(0);
  await send(page, '继续会话甲');
  const request = await page.evaluate(() => (window as unknown as { chatTestRequests: unknown[] }).chatTestRequests.at(-1));
  expect(JSON.stringify(request)).not.toContain('会话乙');
  expect(JSON.stringify(request)).not.toContain('乙的失败修改');
  await page.getByRole('button', { name: '切换到：会话乙' }).click();
  await expect(page.locator('.user-text')).toHaveText('会话乙');
  await expect(page.getByRole('alert', { name: '发送失败' })).toHaveCount(0);
});

test('mobile question editor validates input, cancels safely, and supports Chinese IME', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await send(page, '手机上的原问题');
  const before = await savedConversations(page);
  const opener = page.getByRole('button', { name: '编辑最后一条问题', exact: true });
  await opener.click();
  const editor = page.getByRole('dialog', { name: '编辑最后一条问题', exact: true });
  const input = editor.getByRole('textbox', { name: '问题内容' });
  const save = editor.getByRole('button', { name: '重新发送', exact: true });
  await expect(input).toBeFocused();
  await expect(save).toBeDisabled();
  await input.fill('   ');
  await expect(save).toBeDisabled();
  await input.fill('取消的草稿');
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await expect(opener).toBeFocused();
  expect(await savedConversations(page)).toEqual(before);
  await opener.click();
  await expect(input).toHaveValue('手机上的原问题');
  await input.fill('中文输入');
  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  await expect(editor).toBeVisible();
  await input.dispatchEvent('compositionend');
  await input.fill('中文输入');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('中文输入\n');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await editor.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await input.press('Escape');
  await expect(editor).not.toBeVisible();
  expect(await savedConversations(page)).toEqual(before);
});

for (const operation of ['edit', 'regenerate'] as const) {
  test(`stopping ${operation} before any reply arrives preserves the original turn`, async ({ page }) => {
    await page.goto('/');
    await send(page, '停止前保留的问题');
    const before = await savedConversations(page);
    await nextReply(page, { delay: 1000 });
    if (operation === 'edit') await editQuestion(page, '不应替换原记录的问题');
    else await page.getByRole('button', { name: '重新生成最后一条回复' }).click();
    await page.getByRole('button', { name: '停止生成' }).click();
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
    await expect(page.locator('.user-text')).toHaveText('停止前保留的问题');
    await expect(page.locator('.markdown')).toContainText('回复已完成');
    expect(await savedConversations(page)).toEqual(before);
  });
}

test('retries failed regeneration with the original context and can continue chatting', async ({ page }) => {
  await page.goto('/');
  await send(page, '重新生成后继续的问题');
  await nextReply(page, { failure: 'http' });
  await page.getByRole('button', { name: '重新生成最后一条回复' }).click();
  await expect(page.getByRole('alert', { name: '发送失败' })).toContainText('原问题和回复已恢复');
  await nextReply(page, { first: '成功重试的新回复', last: '' });
  await page.getByRole('button', { name: '重新尝试' }).click();
  await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0);
  await expect(page.locator('.markdown')).toHaveText('成功重试的新回复');
  await send(page, '继续提问');
  const request = await page.evaluate(() => (window as unknown as { chatTestRequests: { messages: { parts: { text: string }[] }[] }[] }).chatTestRequests.at(-1)!);
  expect(request.messages).toHaveLength(3);
  expect(request.messages[1].parts[0].text).toBe('成功重试的新回复');
  await page.reload();
  await expect(page.locator('.user-text')).toHaveText(['重新生成后继续的问题', '继续提问']);
});
