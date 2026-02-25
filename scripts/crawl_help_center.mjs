import { chromium } from 'playwright';
import fs from 'fs';

const ROOT = 'https://wfs-heaven-burns-red.zendesk.com/hc/ja';
const ALLOWED_HOST = 'wfs-heaven-burns-red.zendesk.com';
const MAX_PAGES = 1200;
const MAX_RETRIES = 2;
const MAX_RUNTIME_MS = 8 * 60 * 1000;

function normalizeUrl(raw) {
  try {
    const u = new URL(raw, ROOT);
    if (u.hostname !== ALLOWED_HOST) return null;
    if (!u.pathname.startsWith('/hc/ja')) return null;

    u.hash = '';

    // Query normalization rule:
    // - keep only `page` for list pagination URLs
    // - drop all other params (utm, locale toggles, tracking ids, etc.)
    const keepPage = /\/hc\/ja\/(sections|categories)\//.test(u.pathname) && u.searchParams.has('page');
    const page = keepPage ? u.searchParams.get('page') : null;
    u.search = '';
    if (page) {
      u.searchParams.set('page', page);
    }

    let final = u.toString();
    if (final.endsWith('/')) {
      final = final.slice(0, -1);
    }
    return final;
  } catch {
    return null;
  }
}

function classifyFailure(status, errorMsg) {
  if (status === 401 || status === 403) return '認証または権限制限';
  if (status === 404) return '404 Not Found';
  if (String(errorMsg || '').includes('ERR_NAME_NOT_RESOLVED')) return 'DNS解決失敗';
  if (String(errorMsg || '').includes('Timeout')) return 'タイムアウト';
  return `取得失敗(${status || 'no-status'})`;
}

async function main() {
  const startTs = Date.now();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    locale: 'ja-JP'
  });
  const page = await context.newPage();

  const queue = [normalizeUrl(ROOT)];
  const enqueued = new Set(queue.filter(Boolean));
  const visited = new Set();

  const visitLog = [];
  const failures = [];
  const edgeLog = [];
  const articleFacts = [];

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    if (Date.now() - startTs > MAX_RUNTIME_MS) {
      break;
    }
    const current = queue.shift();
    if (!current || visited.has(current)) continue;

    let success = false;
    let lastError = null;
    let status = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const resp = await page.goto(current, { waitUntil: 'domcontentloaded', timeout: 30000 });
        status = resp ? resp.status() : null;

        if (status && status >= 400) {
          throw new Error(`HTTP_${status}`);
        }

        // Cloudflare verification handling
        const title = await page.title();
        if (/Just a moment/i.test(title) || /security verification/i.test(await page.content())) {
          await page.waitForTimeout(5000);
        }

        await page.waitForTimeout(800);

        const pageTitle = await page.title();
        const links = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href));

        if (/\/hc\/ja\/articles\//.test(current)) {
          const fact = await page.evaluate(() => {
            const title = document.querySelector('h1')?.textContent?.trim() || document.title;
            const updated = document.querySelector('time')?.getAttribute('datetime') || document.querySelector('time')?.textContent?.trim() || null;
            const breadcrumbs = Array.from(document.querySelectorAll('nav a, .breadcrumbs a'))
              .map((a) => (a.textContent || '').trim())
              .filter(Boolean);
            const container = document.querySelector('article') || document.querySelector('.article-body') || document.body;
            const lines = Array.from(container.querySelectorAll('h1, h2, h3, h4, p, li, td, th'))
              .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
              .filter((t) => t.length >= 2);
            return {
              title,
              updated,
              breadcrumbs,
              body_lines: Array.from(new Set(lines)).slice(0, 400)
            };
          });
          articleFacts.push({ url: current, status: status || 200, ...fact });
        }

        const dedup = new Set();
        for (const href of links) {
          const norm = normalizeUrl(href);
          if (!norm || dedup.has(norm)) continue;
          dedup.add(norm);

          edgeLog.push({ from: current, to: norm });

          if (!visited.has(norm) && !enqueued.has(norm)) {
            queue.push(norm);
            enqueued.add(norm);
          }
        }

        visited.add(current);
        visitLog.push({
          url: current,
          title: pageTitle,
          status: status || 200,
          discovered_links: Array.from(dedup),
          queue_after: queue.length
        });
        success = true;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RETRIES) {
          await page.waitForTimeout(1200 * (attempt + 1));
        }
      }
    }

    if (!success) {
      visited.add(current);
      const reason = classifyFailure(status, lastError?.message);
      failures.push({ url: current, status, reason, error: String(lastError?.message || '') });
      visitLog.push({
        url: current,
        title: null,
        status: status || null,
        failed: true,
        reason,
        queue_after: queue.length
      });
    }

    if (visitLog.length % 10 === 0) {
      fs.writeFileSync('data/help_crawl_checkpoint.json', JSON.stringify({ queue, visited: Array.from(visited), visitLog, failures, edgeLog }, null, 2));
      console.log(`progress: visited=${visited.size}, queue=${queue.length}, failed=${failures.length}`);
    }
  }

  const discoveredAll = Array.from(enqueued).sort();
  const visitedList = visitLog.filter((v) => !v.failed).map((v) => v.url).sort();

  const summary = {
    root: ROOT,
    started_at: new Date().toISOString(),
    normalization_rule: {
      host: ALLOWED_HOST,
      path_prefix: '/hc/ja',
      remove_fragment: true,
      query_rule: 'sections/categoriesのページネーションpageのみ保持。その他クエリは同一URLとして除去。'
    },
    counts: {
      discovered: discoveredAll.length,
      visited_success: visitedList.length,
      failed: failures.length,
      unresolved_queue_remaining: queue.length,
      runtime_seconds: Math.floor((Date.now() - startTs) / 1000)
    },
    termination_condition: queue.length === 0
      ? '未訪問リンク0で終了'
      : (visited.size >= MAX_PAGES ? 'MAX_PAGES到達で停止' : 'MAX_RUNTIME到達で停止')
  };

  fs.writeFileSync('data/help_crawl_raw.json', JSON.stringify({ summary, discoveredAll, visitLog, failures, edgeLog, articleFacts }, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
