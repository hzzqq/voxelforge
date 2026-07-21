// VoxelForge 球形挖掘 explode 单元测试（ci88）
// 忠实移植 main.js 中 explode() 纯函数：删除欧氏半径内的方块，返回新 Map（不改原 Map）。
'use strict';
let pass = 0, fail = 0;
function ok(name, cond){ if(cond){ pass++; } else { fail++; console.log('  FAIL: ' + name); } }

const key = (x, y, z) => x + ',' + y + ',' + z;
// --- 忠实移植：explode(edits, cx, cy, cz, radius) ---
function explode(edits, cx, cy, cz, radius){
  const r2 = radius * radius;
  const next = new Map(edits);
  for(const [k] of edits){
    const [x, y, z] = k.split(',').map(Number);
    const dx = x-cx, dy = y-cy, dz = z-cz;
    if(dx*dx + dy*dy + dz*dz <= r2) next.set(k, null);
  }
  return next;
}

// 构造 5×5×5 = 125 个方块
function makeWorld(){
  const m = new Map();
  for(let x=0;x<5;x++) for(let y=0;y<5;y++) for(let z=0;z<5;z++) m.set(key(x,y,z), 1);
  return m;
}

// 1. 中心方块被移除
{
  const e = makeWorld();
  const out = explode(e, 2, 2, 2, 2);
  ok('中心(2,2,2)被移除', out.get(key(2,2,2)) === null);
  ok('近邻(3,2,2)距1被移除', out.get(key(3,2,2)) === null);
  ok('球边界(4,2,2)距2被移除(<=)', out.get(key(4,2,2)) === null);
}

// 2. 球外方块保留，球内/边界移除
{
  const e = makeWorld();
  const out = explode(e, 2, 2, 2, 2);
  ok('远角(0,0,0)距√12>2保留', out.get(key(0,0,0)) === 1);
  ok('(0,2,2)距2 恰在边界 → 被移除', out.get(key(0,2,2)) === null);
  ok('(2,0,2)距2 恰在边界 → 被移除', out.get(key(2,0,2)) === null);
  ok('(1,1,1)距√3<2 球内 → 被移除', out.get(key(1,1,1)) === null);
}

// 3. 原 Map 不被修改（纯函数）
{
  const e = makeWorld();
  const before = e.size;
  const out = explode(e, 2, 2, 2, 2);
  ok('原 Map size 不变', e.size === before);
  ok('原 Map 中心仍存活', e.get(key(2,2,2)) === 1);
  ok('返回的是新 Map', out !== e);
}

// 4. 空 edits 安全
{
  const e = new Map();
  const out = explode(e, 0, 0, 0, 3);
  ok('空输入返回空', out.size === 0);
}

// 5. radius=0 仅移除精确中心
{
  const e = makeWorld();
  const out = explode(e, 2, 2, 2, 0);
  let removed = 0; for(const [k,v] of out) if(v === null) removed++;
  ok('radius=0 仅移除1个(中心)', removed === 1 && out.get(key(2,2,2)) === null);
  ok('radius=0 近邻(3,2,2)保留', out.get(key(3,2,2)) === 1);
}

// 6. 体积守恒：保留数 = 原总数 - 球内数
{
  const e = makeWorld();
  const cx=2,cy=2,cz=2,R=2, r2=R*R;
  let inside = 0;
  for(const [k] of e){ const [x,y,z]=k.split(',').map(Number); const dx=x-cx,dy=y-cy,dz=z-cz; if(dx*dx+dy*dy+dz*dz<=r2) inside++; }
  const out = explode(e, cx, cy, cz, R);
  let remaining = 0; for(const [k,v] of out) if(v !== null) remaining++;
  ok('保留数 = 总数 - 球内数 ('+remaining+'='+(e.size)+'-'+inside+')', remaining === e.size - inside);
}

console.log(`\n_explode_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
