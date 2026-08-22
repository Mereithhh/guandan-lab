import type { MetadataRoute } from 'next';
import { siteOrigin,siteUrl } from '@/lib/site-metadata';

export default function robots():MetadataRoute.Robots{return{
  rules:{userAgent:'*',allow:'/',disallow:['/api/']},
  sitemap:siteUrl('/sitemap.xml'),
  host:siteOrigin,
}}
