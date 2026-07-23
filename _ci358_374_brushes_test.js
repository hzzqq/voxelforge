// ci358/ci362/ci366/ci370/ci374 统一测试：pyramid / torus / ramp / bridge / cylinder 五个笔刷
// 全部遵循 wheel 模式：xxxPoints(R) 点表 + xxxInside(dx,dz,dy,R,H) 单一真相源 + apply/erase 共用。
// 从 main.js 抽取真实纯函数求值并断言；并对 apply 输出与 *Inside 定义做一致性强校验。
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function extractFn(name){
  const re = new RegExp('function ' + name + '\\([\\s\\S]*?\\r?\\n\\}\\r?\\n');
  const m = src.match(re);
  if(!m) throw new Error('找不到函数 ' + name);
  return m[0];
}
const load = name => eval('(' + extractFn(name) + ')');

// 依赖（与真实环境一致的最小集）
const key = (x,y,z) => x + ',' + y + ',' + z;
const wkey = (x,z) => x + ',' + z;
const FALL = new Set(['sand','gravel']);
const PALETTE = { grass:1, dirt:2, stone:3, sand:4, gravel:5, water:6, lava:7, wood:8, leaf:9, snow:10 };

// 全部纯函数
const cylinderPoints = load('cylinderPoints'), cylinderInside = load('cylinderInside');
const applyCylinderBrush = load('applyCylinderBrush'), eraseCylinderBrush = load('eraseCylinderBrush');
const pyramidPoints = load('pyramidPoints'), pyramidInside = load('pyramidInside');
const applyPyramidBrush = load('applyPyramidBrush'), erasePyramidBrush = load('erasePyramidBrush');
const torusPoints = load('torusPoints'), torusInside = load('torusInside');
const applyTorusBrush = load('applyTorusBrush'), eraseTorusBrush = load('eraseTorusBrush');
const rampPoints = load('rampPoints'), rampInside = load('rampInside');
const applyRampBrush = load('applyRampBrush'), eraseRampBrush = load('eraseRampBrush');
const bridgePoints = load('bridgePoints'), bridgeInside = load('bridgeInside');
const applyBridgeBrush = load('applyBridgeBrush'), eraseBridgeBrush = load('eraseBridgeBrush');
const forEachBridgeVoxel = load('forEachBridgeVoxel');   // ci370 抽取桥遍历辅助，apply/erase 共用
const writeVoxel = load('writeVoxel'), clearVoxel = load('clearVoxel');

let pass = 0, fail = 0;
const ok = (c, m) => { if(c) pass++; else { fail++; console.log('  FAIL:', m); } };
// 用 *Inside 重新计算某笔刷在网格上的体素数(单一真相源)
function countInside(inside, R, H){
  let n = 0;
  const Rb = (R > 1) ? R : 1;
  for(let dy=0; dy<H; dy++) for(let dx=-Rb; dx<=Rb; dx++) for(let dz=-Rb; dz<=Rb; dz++){
    if(inside(dx, dz, dy, R, H)) n++;
  }
  return n;
}
function applyCount(apply, R, H){
  const edits = new Map(), waterCol = new Map(), lavaCol = new Map(), falling = new Set();
  apply(edits, waterCol, lavaCol, falling, 0, 0, 0, 'stone', R, H, FALL, key, wkey, PALETTE);
  return edits.size;
}

console.log('== ci358 pyramid ==');
ok(pyramidPoints(2).length === 9, 'pyramidPoints(2) = 9 (底面 3x3 菱形)');
ok(pyramidPoints(3).length > pyramidPoints(2).length, 'pyramidPoints 随 R 增大');
ok(pyramidInside(0,0,0,2,2) === true, 'pyramidInside 中心 true');
ok(pyramidInside(2,0,0,2,2) === false, 'pyramidInside 轴外(|dx|>R-1) false');
ok(applyCount(applyPyramidBrush, 2, 2) === 14, 'apply r2h2 = 14 (9+5)');
ok(applyCount(applyPyramidBrush, 3, 3) === 39, 'apply r3h3 = 39 (21+13+5)');
{
  const edits = new Map(), falling = new Set();
  applyPyramidBrush(edits, new Map(), new Map(), falling, 5, 5, 5, 'sand', 2, 2, FALL, key, wkey, PALETTE);
  ok(edits.size === 14 && falling.size === 14, 'pyramid sand 全入掉落集');
  erasePyramidBrush(edits, new Map(), new Map(), falling, 5, 5, 5, 2, 2, key, wkey);
  ok([...edits.values()].every(v => v === null) && falling.size === 0, 'pyramid erase 清空');
}

console.log('== ci362 torus ==');
ok(torusPoints(3).length > 20, 'torusPoints(3) 环截面点数合理 (>20)');
ok(torusInside(0,0,0,3,3) === false, 'torusInside 中心孔 false');
ok(torusInside(3,0,0,3,3) === true, 'torusInside 环上 (R,0,0) true');
{
  const e = new Map(), wc = new Map(), lc = new Map(), fl = new Set();
  applyTorusBrush(e, wc, lc, fl, 0, 0, 0, 'stone', 3, FALL, key, wkey, PALETTE);
  ok(e.size === 48, 'apply torus R=3 = 48 (与既有回归一致)');
}
{
  // 修复验证：流体列须按逐格 y+1(而非旧常量 top=ny+t)
  const water = new Map(), edits = new Map(), falling = new Set();
  const nyT = 10, RT = 3, tT = Math.max(1, Math.floor(RT/3));
  applyTorusBrush(edits, water, new Map(), falling, 0, nyT, 0, 'water', RT, FALL, key, wkey, PALETTE);
  let bad = 0;
  for(const [wk] of water){
    const [x, z] = wk.split(',').map(Number);
    let maxdy = -99;
    for(let dy=-tT; dy<=tT; dy++){ if(torusInside(x, z, dy, RT, 2*tT+1)) maxdy = dy; }
    if(water.get(wk) !== (nyT + maxdy) + 1) bad++;
  }
  ok(bad === 0, 'torus water 每列高度=该列最高体素 y+1 (修复旧常量 top bug)');
  const e2 = new Map();
  applyTorusBrush(e2, new Map(), new Map(), new Set(), 0, 0, 0, 'stone', 3, FALL, key, wkey, PALETTE);
  eraseTorusBrush(e2, new Map(), new Map(), new Set(), 0, 0, 0, 3, key, wkey);
  ok([...e2.values()].every(v => v === null), 'torus erase 清空');
}

console.log('== ci366 ramp ==');
ok(rampPoints(2).length === 25, 'rampPoints(2) = 25 (5x5 满铺)');
ok(rampInside(0,0,0,2,4) === true, 'rampInside 低处 true');
ok(rampInside(0,0,3,2,4) === false, 'rampInside 高处(dx=0 顶=3) false');
ok(rampInside(2,0,0,2,4) === true, 'rampInside dx=R 整列 true (顶=H)');
{
  const expect = countInside(rampInside, 2, 4);
  ok(applyCount(applyRampBrush, 2, 4) === expect, 'apply ramp == *Inside 定义 (' + expect + ')');
  ok(applyCount(applyRampBrush, 2, 4) === 65, 'apply ramp r2h4 = 65');
  const edits = new Map(), falling = new Set();
  applyRampBrush(edits, new Map(), new Map(), falling, 1, 1, 1, 'sand', 2, 4, FALL, key, wkey, PALETTE);
  eraseRampBrush(edits, new Map(), new Map(), falling, 1, 1, 1, 2, 4, key, wkey);
  ok([...edits.values()].every(v => v === null) && falling.size === 0, 'ramp erase 清空');
}

console.log('== ci370 bridge ==');
ok(bridgePoints(2).length === 10, 'bridgePoints(2) = 10 (两端桥墩各 5)');
ok(bridgeInside(0,0,3,2,4) === true, 'bridgeInside 桥面(deckY) true');
ok(bridgeInside(0,0,0,2,4) === false, 'bridgeInside 桥下留空(false)');
ok(bridgeInside(2,0,0,2,4) === true, 'bridgeInside 端墩(dx=R) true');
{
  const expect = countInside(bridgeInside, 2, 4);
  ok(applyCount(applyBridgeBrush, 2, 4) === expect, 'apply bridge == *Inside 定义 (' + expect + ')');
  const edits = new Map(), falling = new Set();
  applyBridgeBrush(edits, new Map(), new Map(), falling, 2, 2, 2, 'stone', 2, 4, FALL, key, wkey, PALETTE);
  ok(edits.has('2,5,2'), 'bridge 含桥面顶 (dy=deckY)');
  ok(edits.has('4,2,2') && edits.has('0,2,2'), 'bridge 含两端桥墩底 (dx=±R)');
  ok(!edits.has('2,2,2'), 'bridge 桥下中间留空可穿行 (walk-through)');
  eraseBridgeBrush(edits, new Map(), new Map(), falling, 2, 2, 2, 2, 4, key, wkey);
  ok([...edits.values()].every(v => v === null) && falling.size === 0, 'bridge erase 清空');
}

console.log('== ci374 cylinder ==');
ok(cylinderPoints(2).length === 9, 'cylinderPoints(2) = 9');
ok(cylinderPoints(3).length === 25, 'cylinderPoints(3) = 25');
ok(cylinderInside(0,0,0,2,1) === true, 'cylinderInside 中心 true');
ok(cylinderInside(2,0,0,2,1) === false, 'cylinderInside 轴外(|dx|>R-1) false');
ok(applyCount(applyCylinderBrush, 2, 1) === 9, 'apply cylinder r2h1 = 9');
ok(applyCount(applyCylinderBrush, 2, 3) === 27, 'apply cylinder r2h3 = 27');
{
  const edits = new Map(), falling = new Set();
  applyCylinderBrush(edits, new Map(), new Map(), falling, 0, 0, 0, 'sand', 2, 1, FALL, key, wkey, PALETTE);
  ok(falling.size === 9, 'cylinder sand 全入掉落集');
  eraseCylinderBrush(edits, new Map(), new Map(), falling, 0, 0, 0, 2, 1, key, wkey);
  ok([...edits.values()].every(v => v === null) && falling.size === 0, 'cylinder erase 清空');
}

console.log('== 接线 / flash / index 校验 ==');
for(const fn of ['cylinderPoints','cylinderInside','applyCylinderBrush','eraseCylinderBrush',
  'pyramidPoints','pyramidInside','applyPyramidBrush','erasePyramidBrush',
  'torusPoints','torusInside','applyTorusBrush','eraseTorusBrush',
  'rampPoints','rampInside','applyRampBrush','eraseRampBrush',
  'bridgePoints','bridgeInside','applyBridgeBrush','eraseBridgeBrush']){
  ok(new RegExp('function ' + fn + '\\(').test(src), 'main.js 定义 ' + fn);
}
ok(/brushShape === 'ramp'\) applyRampBrush\(/.test(src), 'dispatch apply ramp');
ok(/brushShape === 'ramp'\) eraseRampBrush\(/.test(src), 'dispatch erase ramp');
ok(/brushShape === 'bridge'\) applyBridgeBrush\(/.test(src), 'dispatch apply bridge');
ok(/brushShape === 'bridge'\) eraseBridgeBrush\(/.test(src), 'dispatch erase bridge');
ok(/brushShape === 'ramp' \? '笔刷形状：斜坡'/.test(src), 'flash ramp');
ok(/brushShape === 'bridge' \? '笔刷形状：桥'/.test(src), 'flash bridge');
ok(/<option value="ramp">斜坡<\/option>/.test(html), 'index.html ramp option');
ok(/<option value="bridge">桥<\/option>/.test(html), 'index.html bridge option');

console.log(`\n[ci358-374 brushes] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
