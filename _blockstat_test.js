// 方块统计测试：忠实复刻 voxel-world/main.js 的 blockStats 纯函数与 PALETTE
'use strict';
const PALETTE = {
  grass: 0x6ab04c, dirt: 0x8a5a2b, stone: 0x8d949c, iron: 0xb0b8c0, gold: 0xffd24a,
  diamond: 0x6ffcff, coal: 0x33373d, sand: 0xe2cf8a, gravel: 0x8a8d91,
  water: 0x3a7bd5, lava: 0xe05626, wood: 0x9c6b3f, leaf: 0x3f8f3f, snow: 0xeaf2f7
};
function blockStats(edits, PALETTE, waterCol, lavaCol){
  const colorToType = {};
  for(const t in PALETTE) colorToType[PALETTE[t]] = t;
  const counts = {};
  for(const t in PALETTE) counts[t] = 0;
  let total = 0, removed = 0;
  for(const [, v] of edits){
    if(v == null){ removed++; continue; }
    const t = colorToType[v];
    if(t !== undefined){ counts[t]++; total++; }
  }
  if(waterCol) counts.water = waterCol.size;
  if(lavaCol) counts.lava = lavaCol.size;
  return { counts, total, removed };
}

let pass = 0, fail = 0;
function ok(cond, msg){ if(cond){ pass++; } else { fail++; console.error('FAIL: ' + msg); } }

const key = (x,y,z) => x + ',' + y + ',' + z;

// 1. 空世界
{
  const s = blockStats(new Map(), PALETTE);
  ok(s.total === 0 && s.removed === 0, '空 edits → total=0 removed=0');
  ok(Object.values(s.counts).every(n => n === 0), '空 edits → 所有类型计数=0');
}

// 2. 混合实心方块
{
  const m = new Map();
  m.set(key(0,0,0), PALETTE.grass); m.set(key(1,0,0), PALETTE.grass);
  m.set(key(0,1,0), PALETTE.stone); m.set(key(1,1,0), PALETTE.stone); m.set(key(2,1,0), PALETTE.stone);
  m.set(key(0,2,0), PALETTE.dirt);
  const s = blockStats(m, PALETTE);
  ok(s.counts.grass === 2, 'grass 计数=2');
  ok(s.counts.stone === 3, 'stone 计数=3');
  ok(s.counts.dirt === 1, 'dirt 计数=1');
  ok(s.total === 6, 'total=6');
}

// 3. null(挖空) 计入 removed，不计入 total
{
  const m = new Map();
  m.set(key(0,0,0), PALETTE.sand);
  m.set(key(1,0,0), null);
  m.set(key(2,0,0), null);
  const s = blockStats(m, PALETTE);
  ok(s.total === 1, 'total=1 (忽略 null)');
  ok(s.removed === 2, 'removed=2');
  ok(s.counts.sand === 1, 'sand 计数=1');
}

// 4. 未知颜色被忽略（不污染 total/类型计数）
{
  const m = new Map();
  m.set(key(0,0,0), PALETTE.wood);
  m.set(key(1,0,0), 0x123456);  // 不在 PALETTE
  const s = blockStats(m, PALETTE);
  ok(s.total === 1, '未知颜色不计入 total');
  ok(s.counts.wood === 1, 'wood 仍正确计数');
}

// 5. 流体列计入 water/lava
{
  const wc = new Map([['0,0',2],['1,0',2],['2,0',2]]);
  const lc = new Map([['5,5',3]]);
  const s = blockStats(new Map(), PALETTE, wc, lc);
  ok(s.counts.water === 3, 'water 计数=列数 3');
  ok(s.counts.lava === 1, 'lava 计数=列数 1');
}

// 6. total == 所有实心类型计数之和（不含流体列）
{
  const m = new Map();
  for(let x=0;x<3;x++) for(let y=0;y<3;y++) for(let z=0;z<3;z++) m.set(key(x,y,z), PALETTE.grass);
  const wc = new Map([['0,0',1]]);
  const s = blockStats(m, PALETTE, wc);
  const solidSum = Object.keys(PALETTE).filter(t => t!=='water' && t!=='lava')
    .reduce((a,t) => a + s.counts[t], 0);
  ok(s.total === 27, '3x3x3 grass → total=27');
  ok(solidSum === s.total, '实心类型计数之和 == total');
  ok(s.counts.water === 1, 'water 列单独计入');
}

// 7. 不改入参
{
  const m = new Map([[key(0,0,0), PALETTE.stone]]);
  const before = m.size;
  blockStats(m, PALETTE);
  ok(m.size === before && m.get(key(0,0,0)) === PALETTE.stone, 'blockStats 不修改入参');
}

console.log(`Voxel blockStats: ${pass} passed, ${fail} failed`);
if(fail > 0) process.exit(1);
