import { chromium } from 'playwright';
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('data/help_crawl_raw.json', 'utf8'));
const articleUrls = Array.from(new Set(raw.discoveredAll.filter((u) => /\/hc\/ja\/articles\//.test(u)))).sort();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'ja-JP' });
const page = await context.newPage();

const results = [];

for (let i = 0; i < articleUrls.length; i += 1) {
  const url = articleUrls[i];
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const status = resp ? resp.status() : null;
    if (status && status >= 400) {
      results.push({ url, status, error: `HTTP_${status}` });
      continue;
    }
    await page.waitForTimeout(500);

    const extracted = await page.evaluate(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || document.title;
      const updated = document.querySelector('time')?.getAttribute('datetime') || document.querySelector('time')?.textContent?.trim() || null;
      const breadcrumbs = Array.from(document.querySelectorAll('nav a, .breadcrumbs a')).map((a) => a.textContent?.trim()).filter(Boolean);
      const container = document.querySelector('article') || document.querySelector('.article-body') || document.body;

      const lines = [];
      const pushText = (t) => {
        const s = (t || '').replace(/\s+/g, ' ').trim();
        if (!s) return;
        if (s.length < 2) return;
        lines.push(s);
      };

      container.querySelectorAll('h1, h2, h3, h4, p, li, td, th').forEach((el) => {
        pushText(el.textContent);
      });

      return {
        title,
        updated,
        breadcrumbs,
        body_lines: Array.from(new Set(lines)).slice(0, 400)
      };
    });

    results.push({ url, status: status || 200, ...extracted });
  } catch (e) {
    results.push({ url, status: null, error: String(e.message || e) });
  }

  if ((i + 1) % 10 === 0) {
    console.log(`article progress: ${i + 1}/${articleUrls.length}`);
    fs.writeFileSync('data/help_articles_raw_checkpoint.json', JSON.stringify(results, null, 2));
  }
}

await browser.close();
fs.writeFileSync('data/help_articles_raw.json', JSON.stringify(results, null, 2));

const ok = results.filter((r) => !r.error).length;
const ng = results.length - ok;
console.log(JSON.stringify({ total: results.length, success: ok, failed: ng }, null, 2));
