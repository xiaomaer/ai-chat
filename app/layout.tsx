import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '回声 · 让想法继续生长',
  description: '一个安静的空间，和 AI 一起思考、创作与探索。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
