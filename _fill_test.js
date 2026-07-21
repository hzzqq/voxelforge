// VoxelForge 洪泛填充测试：忠实复刻 main.js floodFill 逻辑
// GLSL 等价(JS)：
//   function floodFill(edits, sx, sy, sz, newType, key, PALETTE){
//     const seed = edits.get(key(sx,sy,sz));
//     if(seed == null) return edits;
//     const reach = PALETTE[newType];
//     if(reach === seed) return edits;
//     const next = new Map(edits);
//     const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
//     const stack = [[sx,sy,sz]];
//     while(stack.length){
//       const [x,y,z] = stack.pop();
//       if(next.get(key(x,y,z)) !== seed) continue;
//       next.set(key(x,y,z), reach);
//       for(const d of N) stack.push([x+d[0], y+d[1], z+d[2]]);
//     }
//     return next;
//   }
'use strict';
const key = (x, y, z) => x + ',' + y + ',' + z;
const PALETTE = { stone: 1, grass: 2, wood: 3, sand: 4, glass: 5, red: 9, blue: 10 };
function floodFill(edits, sx, sy, sz, newType, key, PALETTE){
  const seed = edits.get(key(sx, sy, sz));
  if(seed == null) return edits;
  const reach = PALETTE[newType];
  if(reach === seed) return edits;
  const next = new Map(edits);
  const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  const stack = [[sx, sy, sz]];
  while(stack.length){
    const [x, y, z] = stack.pop();
    if(next.get(key(x, y, z)) !== seed) continue;
    next.set(key(x, y, z), reach);
    for(const d of N) stack.push([x + d[0], y + d[1], z + d[2]]);
  }
  return next;
}

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.error('FAIL: ' + msg); } }
function countColor(m, c){ let n = 0; for(const v of m.values()) if(v === c) n++; return n; }

// 1. 连通同色区域全部替换
{
  const edits = new Map();
  // 3x3x3 石立方
  for(let x=0; x<3; x++) for(let y=0; y<3; y++) for(let z=0; z<3; z++) edits.set(key(x,y,z), PALETTE.stone);
  const out = floodFill(edits, 1, 1, 1, 'red', key, PALETTE);
  ok(countColor(out, PALETTE.red) === 27, '3x3x3 stone flood -> 27 red');
  ok(countColor(out, PALETTE.stone) === 0, 'no stone left after flood');
}

// 2. 不同色相邻方块不被改变(边界)
{
  const edits = new Map();
  for(let x=0; x<3; x++) edits.set(key(x,0,0), PALETTE.stone);  // 直线石
  edits.set(key(3,0,0), PALETTE.grass);                          // 末端草(不同色)
  const out = floodFill(edits, 0, 0, 0, 'red', key, PALETTE);
  ok(out.get(key(3,0,0)) === PALETTE.grass, 'adjacent different-color block untouched');
  ok(countColor(out, PALETTE.red) === 3, 'only the 3 stone filled, grass preserved');
}

// 3. 种子为空 → 原图不变(无副作用)
{
  const edits = new Map();
  edits.set(key(0,0,0), PALETTE.stone);
  const out = floodFill(edits, 5, 5, 5, 'red', key, PALETTE);   // 空种子
  ok(out === edits, 'empty seed returns same reference (no-op)');
}

// 4. 目标同色 → 原图不变
{
  const edits = new Map();
  edits.set(key(0,0,0), PALETTE.stone);
  edits.set(key(1,0,0), PALETTE.stone);
  const out = floodFill(edits, 0, 0, 0, 'stone', key, PALETTE); // 同色
  ok(out === edits, 'same-color target returns same reference (no-op)');
}

// 5. 仅 6 连通(对角不算连通)
{
  const edits = new Map();
  edits.set(key(0,0,0), PALETTE.stone);
  edits.set(key(1,1,0), PALETTE.stone); // 对角相邻(不 6 连通)
  const out = floodFill(edits, 0, 0, 0, 'red', key, PALETTE);
  ok(out.get(key(0,0,0)) === PALETTE.red, 'seed filled');
  ok(out.get(key(1,1,0)) === PALETTE.stone, 'diagonal stone NOT flooded (6-connectivity)');
}

// 6. 返回新 Map，不改原 Map
{
  const edits = new Map();
  for(let x=0; x<2; x++) edits.set(key(x,0,0), PALETTE.stone);
  const before = JSON.stringify([...edits.entries()]);
  const out = floodFill(edits, 0, 0, 0, 'blue', key, PALETTE);
  ok(JSON.stringify([...edits.entries()]) === before, 'original edits unchanged');
  ok(out !== edits, 'returns a new Map instance');
}

// 7. 两个断开的同色区域不合并(只填含种子的那个)
{
  const edits = new Map();
  // 区域 A：x=0..2 一行石
  for(let x=0; x<3; x++) edits.set(key(x,0,0), PALETTE.stone);
  // 区域 B：x=10..12 一行石(不连通)
  for(let x=10; x<13; x++) edits.set(key(x,0,0), PALETTE.stone);
  const out = floodFill(edits, 0, 0, 0, 'red', key, PALETTE);
  ok(countColor(out, PALETTE.red) === 3, 'only region A (3) flooded');
  ok(countColor(out, PALETTE.stone) === 3, 'region B (3) untouched');
}

// 8. 体积守恒：总方块数不变(只换色)
{
  const edits = new Map();
  for(let x=0; x<4; x++) for(let y=0; y<4; y++) for(let z=0; z<4; z++) edits.set(key(x,y,z), PALETTE.stone);
  const totalBefore = edits.size;
  const out = floodFill(edits, 0, 0, 0, 'wood', key, PALETTE);
  ok(out.size === totalBefore, 'voxel count conserved (color change only)');
}

// 9. 大块连通填充计数正确(5x5x1)
{
  const edits = new Map();
  for(let x=0; x<5; x++) for(let z=0; z<5; z++) edits.set(key(x,0,z), PALETTE.glass);
  const out = floodFill(edits, 2, 0, 2, 'sand', key, PALETTE);
  ok(countColor(out, PALETTE.sand) === 25, '5x5 plane flood -> 25 sand');
}

// 10. 跨坐标正负：负坐标区域也能正确洪泛
{
  const edits = new Map();
  for(let x=-2; x<=0; x++) for(let y=0; y<2; y++) edits.set(key(x,y,0), PALETTE.stone);
  const out = floodFill(edits, -2, 0, 0, 'red', key, PALETTE);
  ok(countColor(out, PALETTE.red) === 6, 'negative-coord region flooded (6 blocks)');
}

console.log('voxel-world/_fill_test.js  ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail === 0 ? 0 : 1);
