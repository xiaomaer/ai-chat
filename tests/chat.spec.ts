import { expect, test } from '@playwright/test';

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
      if (text === '模拟失败' && requests.length === 1) {
        return new Response('当前模型的调用额度已用完或请求过于频繁，请稍后重试。', { status: 429 });
      }
      const events = [
        { type: 'start', messageId: `reply-${requests.length}` },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: '这是**流式回复**的第一部分。' },
        { type: 'text-delta', id: 'text-1', delta: '\n\n```typescript\nconst hello = "你好";\n```\n\n回复已完成。' },
        { type: 'text-end', id: 'text-1' },
        { type: 'finish', finishReason: 'stop' },
      ];
      let timer: ReturnType<typeof setInterval>;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          let index = 0;
          const abort = () => { clearInterval(timer); controller.error(new DOMException('Aborted', 'AbortError')); };
          init?.signal?.addEventListener('abort', abort, { once: true });
          timer = setInterval(() => {
            if (index < events.length) controller.enqueue(encoder.encode(`data: ${JSON.stringify(events[index++])}\n\n`));
            else {
              clearInterval(timer);
              init?.signal?.removeEventListener('abort', abort);
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          }, text === '慢速回复' ? 400 : 60);
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

test('preserves Chinese IME Enter and Shift+Enter, and confirms clearing history', async ({ page }) => {
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
  await page.getByRole('button', { name: '开启新对话' }).click();
  await expect(page.locator('.message-user')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '开启新对话' }).click();
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
  await expect(page.getByRole('status')).toContainText('记录无法读取或保存');
  await expect(page.getByRole('textbox')).toBeEnabled();
});

test('route rejects malformed messages before calling the provider', async ({ request }) => {
  const response = await request.post('/api/chat', { data: { messages: [{ id: 'bad', role: 'system', parts: [{ type: 'text', text: 'invalid' }] }] } });
  expect(response.status()).toBe(400);
  const broken = await request.post('/api/chat', { data: 'not-json', headers: { 'Content-Type': 'application/json' } });
  expect(broken.status()).toBe(400);
});
