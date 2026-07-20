// VoxelForge ci54 — 方块拾取与移动 参考测试
// 从 main.js 抽取真实的纯函数 destFromFace / commitMove 并断言行为，
// 与 _water_test / _bvh_sah_test 一致：验证逻辑而非复刻。

const fs = require('fs');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

const m1 = main.match(/function destFromFace\([\s\S]*?\n\}/);
const m2 = main.match(/function commitMove\([\s\S]*?\n\}/);
if(!m1 || !m2){ console.error('未能从 main.js 抽取目标函数'); process.exit(1); }
const destFromFace = eval('(' + m1[0] + ')');
const commitMove  = eval('(' + m2[0] + ')');

let pass=0, fail=0;
function ok(name, cond){ if(cond){ pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } }

console.log('ci54 拾取移动测试');

// destFromFace：命中面法线决定目标坐标（面外侧一格）
(()=>{
  const a = destFromFace(1,2,3, 0,1,0);
  ok('向上面：y+1', a.x===1 && a.y===3 && a.z===3);
  const b = destFromFace(1,2,3, -1,0,0);
  ok('向左面：x-1', b.x===0 && b.y===2 && b.z===3);
  const c = destFromFace(1,2,3, 0,0,1);
  ok('向前面：z+1', c.x===1 && c.y===2 && c.z===4);
  const d = destFromFace(5,5,5, 0,0,0);
  ok('零法线：原地(取消判定依据)', d.x===5 && d.y===5 && d.z===5);
})();

// commitMove：旧位置置 null 哨兵(=空气)、新位置着色；与 codebase 的 editAt 删除语义一致
// （null 哨兵保留 key，voxelColor 据此返回 air）。非空(实心)块数守恒。
(()=>{
  const key = (x,y,z)=> x+','+y+','+z;
  const nonNull = m => { let n=0; for(const v of m.values()) if(v !== null) n++; return n; };
  const edits = new Map();
  edits.set(key(1,1,1), 0x6ab04c);   // 原方块存在（1 个实心）
  const before = nonNull(edits);
  commitMove(edits, {x:1,y:1,z:1}, {x:3,y:1,z:1}, 0x6ab04c, key);
  ok('新位置已着色', edits.get(key(3,1,1)) === 0x6ab04c);
  ok('旧位置已置 null 哨兵(=空气)', edits.get(key(1,1,1)) === null);
  ok('非空实心块数守恒(1->1，仅移动)', nonNull(edits) === before);
})();

// commitMove：源为空气坐标时，移动后源坐标明确记为 null 哨兵(空气)、目标着色
(()=>{
  const key = (x,y,z)=> x+','+y+','+z;
  const edits = new Map();
  commitMove(edits, {x:9,y:9,z:9}, {x:2,y:2,z:2}, 0xffd24a, key);
  ok('目标被写入颜色', edits.get(key(2,2,2)) === 0xffd24a);
  ok('源坐标被记为 null 哨兵(明确为空气)', edits.get(key(9,9,9)) === null);
})();

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
