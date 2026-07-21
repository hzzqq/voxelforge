// ci118 VoxelForge 区域填充 fillBox —— 纯函数忠实移植 + 行为断言 + 源码接线
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };

const key = (x,y,z) => `${x},${y},${z}`;
const PALETTE = { grass:'#2e8b2e', dirt:'#7a5230' };

// 忠实移植 main.js 的 fillBox 纯函数
function fillBox(edits, x0,y0,z0,x1,y1,z1, type, PALETTE){
  const out = new Map(edits);
  const a = [Math.min(x0,x1), Math.min(y0,y1), Math.min(z0,z1)];
  const b = [Math.max(x0,x1), Math.max(y0,y1), Math.max(z0,z1)];
  const color = (type === null || type === 'air') ? null : PALETTE[type];
  for(let x=a[0]; x<=b[0]; x++)
    for(let y=a[1]; y<=b[1]; y++)
      for(let z=a[2]; z<=b[2]; z++)
        out.set(key(x,y,z), color);
  return out;
}

// 填充长方体内部全部置为指定类型
{
  const edits = new Map();
  const out = fillBox(edits, 0,0,0, 2,2,2, 'grass', PALETTE);
  let filled = 0; for(const v of out.values()) if(v === PALETTE.grass) filled++;
  ok('3x3x3 区域填满 = 27 块', filled === 27);
  ok('角点 (0,0,0) 已填充', out.get(key(0,0,0)) === PALETTE.grass);
  ok('角点 (2,2,2) 已填充', out.get(key(2,2,2)) === PALETTE.grass);
  ok('中心点 (1,1,1) 已填充', out.get(key(1,1,1)) === PALETTE.grass);
}
// 反序对角参数等处理
{
  const out = fillBox(new Map(), 2,2,2, 0,0,0, 'dirt', PALETTE);
  ok('反序对角仍填满 27 块', out.size === 27 && out.get(key(1,1,1)) === PALETTE.dirt);
}
// 平面/单层（某维相同）也能填
{
  const out = fillBox(new Map(), 0,5,0, 3,5,3, 'grass', PALETTE);
  let n = 0; for(const v of out.values()) if(v === PALETTE.grass) n++;
  ok('单层 (y=5) 4x1x4 = 16 块', n === 16);
}
// type 为 null/air 时清空区域
{
  const edits = new Map([[key(0,0,0), PALETTE.grass],[key(1,0,0), PALETTE.grass]]);
  const out = fillBox(edits, 0,0,0, 1,0,0, null, PALETTE);
  ok('null 清空区域为 null', out.get(key(0,0,0)) === null && out.get(key(1,0,0)) === null);
}
// 不修改入参（纯函数）
{
  const edits = new Map([[key(0,0,0), PALETTE.grass]]);
  const out = fillBox(edits, 1,1,1, 2,2,2, 'dirt', PALETTE);
  ok('原 edits 未被修改', edits.size === 1 && edits.get(key(0,0,0)) === PALETTE.grass && !edits.has(key(1,1,1)));
  ok('区域外原块保留', out.get(key(0,0,0)) === PALETTE.grass);
}
// 与已有块共存：盒内覆盖、盒外保留
{
  const edits = new Map([[key(9,9,9), PALETTE.dirt], [key(0,0,0), PALETTE.grass]]);
  const out = fillBox(edits, 0,0,0, 1,1,1, 'dirt', PALETTE);
  ok('盒内原块被覆盖', out.get(key(0,0,0)) === PALETTE.dirt);
  ok('盒外块保留', out.get(key(9,9,9)) === PALETTE.dirt);
}

// 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok('main 定义 fillBox', /function fillBox\(/.test(main));
ok('main 定义 fillBoxAt（交互）', /function fillBoxAt\(/.test(main));
ok('pointerdown 分发 fillbox', /else if\(mode === 'fillbox'\) fillBoxAt/.test(main));
ok('声明 fillAnchor 状态', /let fillAnchor = null;/.test(main));
ok('客户端绑定 fillBoxBtn', /\$\('fillBoxBtn'\)\.onclick/.test(main));
ok('index.html 含区域填充按钮', /id="fillBoxBtn"/.test(html));

console.log(`\nci118 fillBox: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
