// ci122 VoxelForge 线段笔刷 lineFill —— 纯函数忠实移植 + 行为断言 + 源码接线
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };

const key = (x,y,z) => `${x},${y},${z}`;
const PALETTE = { grass:'#2e8b2e', dirt:'#7a5230' };

// 忠实移植 main.js 的 lineFill 纯函数（参数化取整 3D 体素线）
function lineFill(edits, x0,y0,z0,x1,y1,z1, type, PALETTE){
  const out = new Map(edits);
  const color = (type === null || type === 'air') ? null : PALETTE[type];
  const dx=x1-x0, dy=y1-y0, dz=z1-z0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  if(steps === 0){ out.set(key(x0,y0,z0), color); return out; }
  for(let i=0;i<=steps;i++){
    const t = i/steps;
    out.set(key(Math.round(x0+dx*t), Math.round(y0+dy*t), Math.round(z0+dz*t)), color);
  }
  return out;
}

// 沿 x 轴直线：4 个连续体素
{
  const out = lineFill(new Map(), 0,0,0, 3,0,0, 'grass', PALETTE);
  ok('x 直线含 (0,0,0)', out.get(key(0,0,0)) === PALETTE.grass);
  ok('x 直线含 (1,0,0)', out.get(key(1,0,0)) === PALETTE.grass);
  ok('x 直线含 (2,0,0)', out.get(key(2,0,0)) === PALETTE.grass);
  ok('x 直线含 (3,0,0)', out.get(key(3,0,0)) === PALETTE.grass);
  ok('x 直线恰 4 块', [...out.values()].filter(v=>v===PALETTE.grass).length === 4);
}
// 对角直线 (0,0,0)->(2,2,2)：3 块且端点都在
{
  const out = lineFill(new Map(), 0,0,0, 2,2,2, 'dirt', PALETTE);
  ok('对角含起点 (0,0,0)', out.get(key(0,0,0)) === PALETTE.dirt);
  ok('对角含终点 (2,2,2)', out.get(key(2,2,2)) === PALETTE.dirt);
  ok('对角恰 3 块', [...out.values()].filter(v=>v===PALETTE.dirt).length === 3);
}
// 单点（起=终）：1 块
{
  const out = lineFill(new Map(), 5,5,5, 5,5,5, 'grass', PALETTE);
  ok('起终点重合 = 1 块', out.size === 1 && out.get(key(5,5,5)) === PALETTE.grass);
}
// 反序端点等价
{
  const a = lineFill(new Map(), 0,0,0, 3,0,0, 'grass', PALETTE);
  const b = lineFill(new Map(), 3,0,0, 0,0,0, 'grass', PALETTE);
  let same = a.size === b.size;
  for(const [k,v] of a) if(b.get(k) !== v) same = false;
  ok('反序连线结果一致', same);
}
// null/air 清空沿线
{
  const edits = new Map([[key(0,0,0), PALETTE.grass],[key(1,0,0), PALETTE.grass],[key(2,0,0), PALETTE.grass],[key(3,0,0), PALETTE.grass]]);
  const out = lineFill(edits, 0,0,0, 3,0,0, null, PALETTE);
  ok('null 沿线清空为 null', out.get(key(0,0,0)) === null && out.get(key(3,0,0)) === null);
}
// 不修改入参（纯函数）
{
  const edits = new Map([[key(9,9,9), PALETTE.dirt]]);
  const out = lineFill(edits, 0,0,0, 1,0,0, 'grass', PALETTE);
  ok('原 edits 未被修改', edits.size === 1 && edits.get(key(9,9,9)) === PALETTE.dirt);
  ok('盒外原块保留', out.get(key(9,9,9)) === PALETTE.dirt);
}

// 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok('main 定义 lineFill', /function lineFill\(/.test(main));
ok('main 定义 lineFillAt（交互）', /function lineFillAt\(/.test(main));
ok('pointerdown 分发 line', /else if\(mode === 'line'\) lineFillAt/.test(main));
ok('声明 lineAnchor 状态', /let lineAnchor = null;/.test(main));
ok('客户端绑定 lineBtn', /\$\('lineBtn'\)\.onclick/.test(main));
ok('index.html 含连线按钮', /id="lineBtn"/.test(html));

console.log(`\nci122 lineFill: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
