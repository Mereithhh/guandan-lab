import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: '掼蛋特训局｜快速会打，体面上桌',
  description: '零基础掼蛋教学、AI 实战、九宫格记牌与牌局复盘训练。',
  openGraph: { title: '掼蛋特训局', description: '快速会打，体面上桌', images: ['/og.png'] },
  twitter: { card: 'summary_large_image', title: '掼蛋特训局', description: '快速会打，体面上桌', images: ['/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
