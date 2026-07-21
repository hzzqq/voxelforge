// ci114 VoxelForge 选择复制/粘贴 —— 纯函数忠实移植 + 行为断言
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };

const key = (x,y,z) => `${x},${y},${z}`;
const PALETTE = { grass:'#2e8b2e', dirt:'#7a5230' };

function copySelection(edits, x0,y0,z0,x1,y1,z1){
  const a=[Math.min(x0,x1),Math.min(y0,y1),Math.min(z0,z1)], b=[Math.max(x0,x1),Math.max(y0,y1),Math.max(z0,z1)];
  const out = new Map();
  for(const [k,v] of edits){
    if(v == null) continue;
    const [x,y,z] = k.split(',').map(Number);
    if(x>=a[0]&&x<=b[0]&&y>=a[1]&&y<=b[1]&&z>=a[2]&&z<=b[2]) out.set(k, v);
  }
  return out;
}
function pasteSelection(edits, clip, dx, dy, dz){
  const out = new Map(edits);
  for(const [k, v] of clip){
    const [x,y,z] = k.split(',').map(Number);
    out.set(key(x+dx, y+dy, z+dz), v);
  }
  return out;
}

// 框选复制：仅取盒内非空
{
  const edits = new Map([
    [key(0,0,0), PALETTE.grass],
    [key(5,5,5), PALETTE.dirt],
    [key(1,1,1), null]            // 挖空跳过
  ]);
  const clip = copySelection(edits, 0,0,0, 2,2,2);
  ok('按盒复制含 (0,0,0)', clip.has(key(0,0,0)) && clip.get(key(0,0,0)) === PALETTE.grass);
  ok('按盒复制排除盒外 (5,5,5)', !clip.has(key(5,5,5)));
  ok('按盒复制跳过挖空 (1,1,1)', !clip.has(key(1,1,1)));
}
// 反序盒参数仍能正确框选
{
  const edits = new Map([[key(3,3,3), PALETTE.grass]]);
  const clip = copySelection(edits, 5,5,5, 0,0,0);
  ok('反序盒参数仍命中', clip.has(key(3,3,3)));
}
// 粘贴：整体偏移且不改原图
{
  const edits = new Map([[key(0,0,0), PALETTE.grass]]);
  const clip = copySelection(edits, 0,0,0, 0,0,0);
  const out = pasteSelection(edits, clip, 1,2,3);
  ok('粘贴后新增偏移位置', out.has(key(1,2,3)) && out.get(key(1,2,3)) === PALETTE.grass);
  ok('粘贴后原位置仍在', out.has(key(0,0,0)));
  ok('原 edits 未被修改', edits.size === 1 && edits.has(key(0,0,0)) && !edits.has(key(1,2,3)));
}
// 粘贴覆盖同名键
{
  const edits = new Map([[key(1,1,1), PALETTE.dirt]]);
  const clip = new Map([[key(0,0,0), PALETTE.grass]]);
  const out = pasteSelection(edits, clip, 1,1,1);   // 偏移到 (1,1,1)，覆盖原 dirt
  ok('粘贴偏移覆盖同名键', out.get(key(1,1,1)) === PALETTE.grass);
}
// 源码接线
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok('main 定义 copySelection', /function copySelection\(/.test(main));
ok('main 定义 pasteSelection', /function pasteSelection\(/.test(main));
ok('客户端绑定 copyBtn/pasteBtn', /\$\('copyBtn'\)\.onclick/.test(main) && /\$\('pasteBtn'\)\.onclick/.test(main));
ok('index.html 含复制/粘贴按钮', /id="copyBtn"/.test(html) && /id="pasteBtn"/.test(html));

console.log(`\nci114 copy/paste: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
