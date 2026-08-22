import type { Metadata } from 'next';
import './globals.css';
import { siteOrigin,siteUrl } from '@/lib/site-metadata';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: 'GuanDan Lab 掼蛋实验室｜快速会打，体面上桌',
  description: '开源掼蛋训练器：以 2022 竞技规则为基线的教学引擎、AI 陪练、语音教练、九宫格记牌与证据化复盘。',
  applicationName:'GuanDan Lab',
  category:'education',
  keywords:['掼蛋','掼蛋规则','掼蛋教学','掼蛋记牌','Guan Dan','AI 陪练','开源游戏'],
  authors:[{name:'GuanDan Lab contributors',url:'https://github.com/Mereithhh/guandan-lab'}],
  creator:'GuanDan Lab contributors',
  icons:{icon:[{url:'/favicon.svg',type:'image/svg+xml'},{url:'/icon-192.png',sizes:'192x192',type:'image/png'}],apple:'/icon-192.png'},
  manifest:'/manifest.webmanifest',
  alternates: { canonical: '/' },
  openGraph: { type:'website',title: 'GuanDan Lab · 掼蛋实验室', description: '不是教你赢老板，是教你成为大家愿意再约的搭档。', url: '/', siteName: 'GuanDan Lab', locale: 'zh_CN', images: [{url:'/og.png',width:1200,height:630,alt:'GuanDan Lab 掼蛋实验室'}] },
  twitter: { card: 'summary_large_image', title: 'GuanDan Lab · 掼蛋实验室', description: '关键回合有提示 · 每局有证据复盘', images: ['/og.png'] },
  appleWebApp:{capable:true,title:'GuanDan Lab',statusBarStyle:'black-translucent'},
};

const structuredData={
  '@context':'https://schema.org',
  '@type':['SoftwareApplication','LearningResource'],
  name:'GuanDan Lab 掼蛋实验室',
  url:siteOrigin,
  image:siteUrl('/og.png'),
  description:'开源零基础掼蛋训练器，提供规则课、与 3 位 AI 牌友进行四人陪练、记牌训练和完整事件回放。',
  applicationCategory:'EducationalApplication',
  operatingSystem:'Web',
  inLanguage:['zh-CN','en'],
  isAccessibleForFree:true,
  license:'https://www.apache.org/licenses/LICENSE-2.0',
  codeRepository:'https://github.com/Mereithhh/guandan-lab',
  offers:{'@type':'Offer',price:'0',priceCurrency:'CNY'},
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(structuredData).replace(/</gu,'\\u003c')}}/></body></html>;
}
