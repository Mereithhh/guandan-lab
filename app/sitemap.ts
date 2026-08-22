import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-metadata';

export default function sitemap():MetadataRoute.Sitemap{return[{
  url:siteUrl('/'),
  lastModified:new Date('2026-08-22T00:00:00.000Z'),
  changeFrequency:'weekly',
  priority:1,
}]}
