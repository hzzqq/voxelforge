// 忠实移植 voxel-world/main.js 的 applyWedgeBrush / eraseWedgeBrush 纯函数并验证几何。
// 楔形截面：以 (nx,ny,nz) 为底面角点，XZ 平面 dx,dz∈[0,r]，满足 dx+dz<=r 的直角三角形，
// 沿 y 向上填充 height=r 格。
'use strict';
const assert = require('assert');
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  ✗ ' + name); } }

function key(x,y,z){ return x + ',' + y + ',' + z; }
function wkey(x,z){ return x + ',' + z; }
const PALETTE = { stone: '#888' };
const FALL = new Set();

function applyWedgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, brush, radius, FALLv, key, wkey, PALETTEv){
  const r = Math.max(1, radius|0);
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = 0; dx <= r; dx++) for(let dz = 0; dz <= r; dz++){
      if(dx + dz > r) continue;
      const x = nx + dx, z = nz + dz;
      const k = key(x, y, z), wk = wkey(x, z);
      if(brush === 'lava'){ lavaCol.set(wk, y + 1); continue; }
      if(brush === 'water'){ waterCol.set(wk, y + 1); continue; }
      edits.set(k, PALETTEv[brush]);
      if(FALLv.has(brush)) falling.add(k);
    }
  }
}
function eraseWedgeBrush(edits, waterCol, lavaCol, falling, nx, ny, nz, radius, key, wkey){
  const r = Math.max(1, radius|0);
  const h = r;
  for(let dy = 0; dy < h; dy++){
    const y = ny + dy;
    for(let dx = 0; dx <= r; dx++) for(let dz = 0; dz <= r; dz++){
      if(dx + dz > r) continue;
      const x = nx + dx, z = nz + dz;
      const kk = key(x, y, z), wk = wkey(x, z);
      if(waterCol.has(wk) && waterCol.get(wk) === y + 1) waterCol.delete(wk);
      if(lavaCol.has(wk) && lavaCol.get(wk) === y + 1) lavaCol.delete(wk);
      edits.set(kk, null);
      falling.delete(kk);
    }
  }
}

// r=1 → 3 格
(()=>{ const e=new Map(); applyWedgeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',1,FALL,key,wkey,PALETTE);
  ok('r=1 生成 3 格(直角三角形截面×1层)', e.size===3); })();
// r=2 → 6×2=12
(()=>{ const e=new Map(); applyWedgeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  ok('r=2 生成 12 格(6×2)', e.size===12); })();
// r=3 → 10×3=30
(()=>{ const e=new Map(); applyWedgeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',3,FALL,key,wkey,PALETTE);
  ok('r=3 生成 30 格(10×3)', e.size===30); })();

// 截面几何：r=2 应包含 (0,0,0)(2,0,0)(0,0,2)(1,1,0)，不应包含 (2,2,0)（2+2>2）
(()=>{ const e=new Map(); applyWedgeBrush(e,new Map(),new Map(),new Set(),0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  ok('含 (0,0,0)', e.has(key(0,0,0)));
  ok('含 (2,0,0)', e.has(key(2,0,0)));
  ok('含 (0,0,2)', e.has(key(0,0,2)));
  ok('含 (1,1,0)', e.has(key(1,1,0)));
  ok('不含 (2,2,0)(超出 dx+dz<=2)', !e.has(key(2,2,0))); })();

// 高度方向：r=2 在 y=0,1 各 6 格，y=2 无
(()=>{ const e=new Map(); applyWedgeBrush(e,new Map(),new Map(),new Set(),0,5,0,'stone',2,FALL,key,wkey,PALETTE);
  ok('y=5 层有 (0,5,0)', e.has(key(0,5,0)));
  ok('y=6 层有 (0,6,0)', e.has(key(0,6,0)));
  ok('y=7 层无 (高度=r=2，仅 5/6)', !e.has(key(0,7,0))); })();

// 擦除：先 apply 再 erase，应把所有值置为 null(标记擦除，键仍保留)
(()=>{ const e=new Map(); const w=new Map(), l=new Map(), f=new Set();
  applyWedgeBrush(e,w,l,f,0,0,0,'stone',2,FALL,key,wkey,PALETTE);
  const before=e.size; eraseWedgeBrush(e,w,l,f,0,0,0,2,key,wkey);
  ok('擦除前有 12 格', before===12);
  ok('擦除后所有值为 null(标记擦除)', e.size===before && [...e.values()].every(v=>v===null)); })();

// 流体语义：water 不写入 edits，只记 waterCol
(()=>{ const e=new Map(); const w=new Map(), l=new Map(), f=new Set();
  applyWedgeBrush(e,w,l,f,0,0,0,'water',1,FALL,key,wkey,PALETTE);
  ok('water 模式 edits 为空', e.size===0);
  ok('water 模式记录 3 个水柱', w.size===3); })();

console.log('wedge: ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
