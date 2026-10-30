# Hormang provider landing page

A one-page site for service providers ("ijrochilar"), in Uzbek (default), Russian and English.

## Put it online

The ready-to-upload site is the `dist/` folder. Pick one:

- **Netlify Drop (no account setup needed beyond sign-in):** open https://app.netlify.com/drop and drag the `dist` folder onto the page.
- **Vercel:** import this folder as a project. Build command `npm run build`, output folder `dist`.
- **Your own server:** copy the contents of `dist/` to the web root of a domain or subdomain (for example `ijrochi.hormang.co.uz`).

The site expects to sit at the root of its domain. If it must live under a path such as `hormang.co.uz/ijrochilar/`, set `base: "/ijrochilar/"` in `vite.config.ts` and rebuild.

## Language links

- Uzbek: `/` (default; the last language a visitor picked is remembered)
- Russian: `/?lang=ru`
- English: `/?lang=en`

Use the `?lang=` links in Russian-language ads.

## Edit and rebuild

- All text: `src/lib/i18n.ts`
- Page layout: `src/App.tsx`
- Screenshots: `public/screens/` (keep the same file names)

```
npm install
npm run dev     # local preview
npm run build   # writes dist/
```
