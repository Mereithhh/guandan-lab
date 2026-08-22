import type { MetadataRoute } from 'next';

export default function manifest():MetadataRoute.Manifest{return{
  id:'/',
  name:'GuanDan Lab',
  short_name:'GuanDan Lab',
  description:'Guan Dan rules, practice with 3 AI players, memory drills and replays / 掼蛋规则、3 位 AI 陪练、记牌与复盘。',
  start_url:'/',
  scope:'/',
  display:'standalone',
  orientation:'any',
  background_color:'#101827',
  theme_color:'#101827',
  categories:['education','games'],
  icons:[
    {src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
    {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
    {src:'/favicon.svg',sizes:'any',type:'image/svg+xml'},
  ],
}}
