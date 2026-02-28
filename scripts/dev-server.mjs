#!/usr/bin/env node
/**
 * シンプルな開発用HTTPサーバー（.gitignore無視）
 * Playwright E2Eテスト用
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const PORT = Number(process.env.PORT ?? 4173);

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const NO_CACHE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const filePath = join(ROOT, url.pathname);

  try {
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType, ...NO_CACHE_HEADERS });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain', ...NO_CACHE_HEADERS });
    res.end('Not found: ' + url.pathname);
  }
});

server.listen(PORT, () => {
  console.log(`Dev server listening on http://localhost:${PORT}`);
  console.log(`Serving root: ${ROOT}`);
});
