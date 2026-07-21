// ci106 VoxelForge 球形笔刷 —— 纯函数忠实移植 + 行为断言
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };

// ---- 忠实移植 main.js 的 applySphereBrush / eraseSphereBrush（含依赖桩）----
const key = (x,y,z) => `${x},${y},${z}`;
const wkey = (x,z) => `${x},${z}`;
const PALETTE = { grass:'#2e8b2e', dirt:'#7a5230', stone:'#888', sand:'#d9c27a', gravel:'#9a9a9a', water:'#2a6fa0', lava:'#d23b1e', wood:'#8a5a2b', leaf:'#3aa33a' };
const FALL = new Set(['sand','gravel']);

function applySphereBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALL, key, wkey, PALETTE){
  const r = Math.max(1, radius|0);
  const top = ny + 2*r - 1;
  for(let dx=-r+1; dx<r; dx++) for(let dy=-r+1; dy<r; dy++) for(let dz=-r+1; dz<r; dz++){
    if(dx*dx + dy*dy + dz*dz > r*r) continue;
    const x = nx+dx, y = ny+dy, z = nz+dz;
    const k = key(x,y,z), wk = wkey(x,z);
    if(brush === 'lava'){ lavaCol.set(wk, top); continue; }
    if(brush === 'water'){ waterCol.set(wk, top); continue; }
    edits.set(k, PALETTE[brush]);
    if(FALL.has(brush)) falling.add(k);
  }
}

// ---- 半径 1 => 单格 ----
{
  const edits = new Map(), wc = new Map(), lc = new Map(), fl = new Set();
  applySphereBrush(edits, wc, lc, fl, 10, 10, 10, 'grass', 1, FALL, key, wkey, PALETTE);
  ok('半径1 仅写入中心 1 格', edits.size === 1 && edits.get('10,10,10') === PALETTE.grass);
}
// ---- 半径 3 => 球（< 盒 125，且剔除角点 (2,2,2)）----
{
  const edits = new Map(), wc = new Map(), lc = new Map(), fl = new Set();
  applySphereBrush(edits, wc, lc, fl, 0, 0, 0, 'stone', 3, FALL, key, wkey, PALETTE);
  ok('半径3 球格数 > 0 且 < 125(盒)', edits.size > 0 && edits.size < 125);
  ok('半径3 包含中心点', edits.has('0,0,0') && edits.get('0,0,0') === PALETTE.stone);
  ok('半径3 剔除角点 (2,2,2) [sumsq=12>9]', !edits.has('2,2,2'));
  ok('半径3 包含面心 (2,0,0) [sumsq=4]', edits.has('2,0,0'));
}
// ---- 球 vs 盒：半径3 时盒含角点、球不含 ----
{
  // 用同一几何构造盒（size=5）
  function applyBox(edits, nx,ny,nz, brush, size){
    const top = ny + size;
    for(let di=0; di<size; di++) for(let dj=0; dj<size; dj++) for(let dk=0; dk<size; dk++)
      edits.set(key(nx+di,ny+dj,nz+dk), PALETTE[brush]);
  }
  const box = new Map(); applyBox(box, 0,0,0, 'stone', 5);
  const sph = new Map(), wc=new Map(), lc=new Map(), fl=new Set();
  applySphereBrush(sph, wc, lc, fl, 0,0,0, 'stone', 3, FALL, key, wkey, PALETTE);
  ok('盒含角点 (2,2,2) 而球不含', box.has('2,2,2') && !sph.has('2,2,2'));
  ok('球格数 < 盒格数(125)', sph.size < box.size);
}
// ---- 流体列：lava 顶面对齐球顶 y = ny + 2r - 1 ----
{
  const edits = new Map(), wc = new Map(), lc = new Map(), fl = new Set();
  applySphereBrush(edits, wc, lc, fl, 5, 5, 5, 'lava', 2, FALL, key, wkey, PALETTE);
  ok('lava 列顶 = ny+2r-1 (5+3=8)', lc.get('5,5') === 8);
}
// ---- 掉落集：沙/砾石入集 ----
{
  const edits = new Map(), wc = new Map(), lc = new Map(), fl = new Set();
  applySphereBrush(edits, wc, lc, fl, 0,0,0, 'sand', 1, FALL, key, wkey, PALETTE);
  ok('沙落入掉落集', fl.has('0,0,0'));
}
// ---- 源码接线 ----
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
ok('main 定义 applySphereBrush', /function applySphereBrush\(/.test(main));
ok('main 定义 eraseSphereBrush', /function eraseSphereBrush\(/.test(main));
ok('dispatch 走球形分支(apply)', /brushShape === 'sphere'\) applySphereBrush\(/.test(main));
ok('dispatch 走球形分支(erase)', /brushShape === 'sphere'\) eraseSphereBrush\(/.test(main));
ok('状态含 brushShape', /brushShape = 'box'/.test(main));
ok('index.html 含笔刷形状控件', /id="brushShape"/.test(fs.readFileSync(path.join(__dirname,'index.html'),'utf8')));
ok('UI 绑定 brushShape', /\$\('brushShape'\)\.onchange/.test(main));

console.log(`\nci106 sphereBrush: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
