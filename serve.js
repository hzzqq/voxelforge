#!/usr/bin/env node
// 极简零依赖静态文件服务器 —— 供本项目页面在 http:// 下运行。
// ES Module（<script type="module"> + importmap）在 file:// 下会被浏览器拦截，必须经 http 提供。
// 用法: node serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;                                   // 固定服务本项目目录，双击任意位置均可
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.obj': 'text/plain',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.map': 'application/json'
};

http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('403 Forbidden'); return; }   // 防目录穿越
  fs.readFile(fp, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + p);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log('  [OK] static server: http://localhost:' + PORT + '/');
  console.log('  [dir] ' + ROOT);
  console.log('  [stop] press Ctrl+C in this window');
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('  [ERROR] port ' + PORT + ' is in use. Set another: node serve.js 9090');
  else console.error('  [ERROR] ' + e.message);
  process.exit(1);
});
