import { google } from '@ai-sdk/google';
import { convertToModelMessages, streamText, validateUIMessages } from 'ai';
import { isChatHistory, MODEL_ID } from '@/lib/chat';
import { chatErrorMessage } from '@/lib/chat-error';

export const maxDuration = 60;

export async function POST(request: Request) {
  let messages;
  try {
    const body = await request.json();
    const candidate: unknown = body?.messages;
    if (!isChatHistory(candidate) || candidate.length === 0 ||
      candidate.at(-1)?.role !== 'user' ||
      candidate.some(message => !message.parts.some(part => part.type === 'text' && part.text.trim()))) {
      return new Response('消息格式无效，请重新开始对话。', { status: 400 });
    }
    messages = await validateUIMessages({ messages: candidate });
  } catch {
    return new Response('无法读取聊天记录，请重新开始对话。', { status: 400 });
  }

  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new Response('尚未配置模型密钥，请在项目的 .env 中设置 GOOGLE_GENERATIVE_AI_API_KEY 后重启服务。', { status: 503 });
  }

  try {
    const result = streamText({
      model: google(MODEL_ID),
      instructions: '你是回声，一位清晰、友善的 AI 助手。默认使用中文回答，除非用户要求其他语言。使用 Markdown 组织回答，代码标明语言。',
      messages: await convertToModelMessages(messages),
      abortSignal: request.signal,
      maxRetries: 0,
      onError: ({ error }) => { console.error(chatErrorMessage(error)); },
    });
    return result.toUIMessageStreamResponse({
      sendReasoning: false,
      onError: chatErrorMessage,
    });
  } catch (error) {
    return new Response(chatErrorMessage(error), { status: 502 });
  }
}
