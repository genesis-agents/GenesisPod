import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';

// ★ 跳过静态生成 - 应用使用客户端上下文，必须在运行时渲染
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Teams Engine - AI驱动的多智能体协作平台',
  description: '多Agent协作，智能完成复杂任务',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
