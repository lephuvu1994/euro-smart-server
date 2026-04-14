import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type Language = 'en' | 'vi';

let cache: Record<Language, any> | null = null;

export function loadI18n() {
  if (cache) return cache;
  cache = { en: {}, vi: {} };

  const possiblePaths = [
    join(process.cwd(), 'libs', 'common', 'src', 'message', 'languages'),
    join(__dirname, '..', '..', '..', '..', '..', 'libs', 'common', 'src', 'message', 'languages'),
    join(__dirname, '..', '..', '..', '..', 'libs', 'common', 'src', 'message', 'languages'),
    join(__dirname, '..', '..', '..', 'libs', 'common', 'src', 'message', 'languages'),
  ];

  for (const lang of ['en', 'vi']) {
    for (const p of possiblePaths) {
      const filePath = join(p, lang, 'mcp.json');
      if (existsSync(filePath)) {
        try {
          cache[lang as Language] = JSON.parse(readFileSync(filePath, 'utf-8'));
          break;
        } catch (e) {
          // ignore parsing error
        }
      }
    }
  }
  return cache;
}

export function t(
  lang: string | undefined,
  key: string,
  args?: Record<string, string | number>,
): string {
  const dictionary = loadI18n();
  const safeLang = lang === 'en' ? 'en' : 'vi'; // default vi
  const keys = key.split('.');

  let val = dictionary[safeLang];
  for (const k of keys) {
    if (val && typeof val === 'object') {
      val = val[k];
    } else {
      val = undefined;
      break;
    }
  }

  if (typeof val !== 'string') {
    // fallback to vi
    if (safeLang !== 'vi') {
      return t('vi', key, args);
    }
    return key; // return key itself if not found
  }

  let res = val;
  if (args) {
    for (const [k, v] of Object.entries(args)) {
      res = res.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return res;
}
