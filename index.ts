import 'dotenv/config';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

const { text } = await generateText({
  model: google('gemini-3.1-flash-lite'),
  prompt: '请用中文解释 TypeScript 的优势，并给一个简短例子。',
});

console.log(text);