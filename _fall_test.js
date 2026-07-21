// VoxelForge ci60 — 掉落方块物理 参考测试
// 从 main.js 抽取真实的纯函数 stepFalling 并断言行为（与 _water_test / _move_test 一致：验证逻辑而非复刻）。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
const stepFalling = new Function(src.match(/function stepFalling\([\s\S]*?\n}/)[0] + '\nreturn stepFalling;')();

let fail = 0, pass = 0;
const ok = (n, c) => c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n));

const key = (x, y, z) => x + ',' + y + ',' + z;
const SAND = 0xe2cf8a, GRAVEL = 0x8a8d91, STONE = 0x8d949c;
// 测试地形模型：y<=0 为不可穿透的地面（实心）；其余由 edits 中的颜色决定。
function makeSolid(edits){ return (x, y, z) => { if(y <= 0) return true; const v = edits.get(key(x,y,z)); return v !== null && v !== undefined; }; }
const run = (falling, edits, n) => { const s = makeSolid(edits); for(let i=0;i<n;i++) stepFalling(falling, edits, s, key); };

console.log('ci60 掉落方块测试');

// A — 悬空单块下落并停在地形上
(()=>{
  const edits = new Map(), falling = new Set();
  edits.set(key(0,3,0), SAND); falling.add(key(0,3,0));
  run(falling, edits, 20);
  ok('A: 悬空块落入 y=1（停在地形 y<=0 之上）', edits.get(key(0,1,0)) === SAND && edits.get(key(0,3,0)) == null && edits.get(key(0,2,0)) == null);
  ok('A: falling 集收敛到静止坐标', falling.size === 1 && falling.has(key(0,1,0)));
})();

// B — 有支撑的堆叠不移动
(()=>{
  const edits = new Map(), falling = new Set();
  for(const y of [1,2,3]){ edits.set(key(0,y,0), SAND); falling.add(key(0,y,0)); }
  run(falling, edits, 10);
  ok('B: 有支撑的堆叠保持原位 (1,2,3)', edits.get(key(0,1,0)) === SAND && edits.get(key(0,2,0)) === SAND && edits.get(key(0,3,0)) === SAND);
})();

// C — 不穿透实心障碍物（停在障碍上方）
(()=>{
  const edits = new Map(), falling = new Set();
  edits.set(key(0,2,0), STONE);          // 障碍物（不在掉落集）
  edits.set(key(0,4,0), SAND); falling.add(key(0,4,0));
  run(falling, edits, 10);
  ok('C: 沙停在障碍上方 (y=3)', edits.get(key(0,3,0)) === SAND);
  ok('C: 障碍物未被覆盖/移动', edits.get(key(0,2,0)) === STONE);
  ok('C: 沙未穿透到 y<=2', edits.get(key(0,2,0)) === STONE && edits.get(key(0,1,0)) == null);
})();

// D — 悬空堆叠整体下落（填充下方空隙）且体积守恒
(()=>{
  const edits = new Map(), falling = new Set();
  for(const y of [5,6,7]){ edits.set(key(0,y,0), SAND); falling.add(key(0,y,0)); } // 下方 y=1..4 空
  const before = [...edits.values()].filter(v => v !== null).length;
  run(falling, edits, 30);
  const after = [...edits.values()].filter(v => v !== null).length;
  ok('D: 掉落过程实心块数守恒 (3->3)', before === 3 && after === 3);
  ok('D: 堆叠整体下落到地形 (1,2,3)', edits.get(key(0,1,0)) === SAND && edits.get(key(0,2,0)) === SAND && edits.get(key(0,3,0)) === SAND && edits.get(key(0,5,0)) == null);
})();

// E — 沙与砾石各自独立下落（不同材质都参与重力）
(()=>{
  const edits = new Map(), falling = new Set();
  edits.set(key(2,4,0), SAND); falling.add(key(2,4,0));
  edits.set(key(5,6,0), GRAVEL); falling.add(key(5,6,0));
  run(falling, edits, 20);
  ok('E: 沙落到 (2,1,0)', edits.get(key(2,1,0)) === SAND);
  ok('E: 砾石落到 (5,1,0)', edits.get(key(5,1,0)) === GRAVEL);
  ok('E: 两者均从原位置移走', edits.get(key(2,4,0)) == null && edits.get(key(5,6,0)) == null);
})();

console.log(`\n[VoxelForge fall] pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
