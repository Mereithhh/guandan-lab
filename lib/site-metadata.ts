export const siteOrigin=new URL(process.env.SITE_URL??'https://guandan.mereith.com').origin;

export const siteUrl=(path='/')=>new URL(path,`${siteOrigin}/`).toString();
