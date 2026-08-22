import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'https://guandan.mereith.com'),
  title: 'GuanDan Lab 掼蛋实验室｜快速会打，体面上桌',
  description: '开源掼蛋训练器：以 2022 竞技规则为基线的教学引擎、AI 陪练、语音教练、九宫格记牌与证据化复盘。',
  alternates: { canonical: '/' },
  openGraph: { title: 'GuanDan Lab · 掼蛋实验室', description: '不是教你赢老板，是教你成为大家愿意再约的搭档。', url: '/', siteName: 'GuanDan Lab', locale: 'zh_CN', images: ['/og.png'] },
  twitter: { card: 'summary_large_image', title: 'GuanDan Lab · 掼蛋实验室', description: '关键回合有提示 · 每局有证据复盘', images: ['/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
