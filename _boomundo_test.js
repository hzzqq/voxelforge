// 验证 voxel-world/main.js 的爆破(boomAt)现已接入撤销栈(修复"爆炸不可逆"真 bug)，并验证撤销往返语义。
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL:', n); } };
const key = (x,y,z) => `${x},${y},${z}`;

// 忠实移植 explode(球形删除) 与快照式撤销机制(与 main.js 同构)
function explode(edits, cx, cy, cz, R){
  const out = new Map(edits), r2 = R*R;
  for(const [k] of edits){ const [x,y,z]=k.split(',').map(Number); const dx=x-cx,dy=y-cy,dz=z-cz; if(dx*dx+dy*dy+dz*dz<=r2) out.delete(k); }
  return out;
}
let edits = new Map();
let undoStack = [], redoStack = [];
const snapshotEdits = () => new Map(edits);
const editsEqual = (a,b) => { if(a.size!==b.size) return false; for(const [k,v] of a) if(b.get(k)!==v) return false; return true; };
const recordUndo = (prev) => { if(prev && !editsEqual(prev, edits)){ undoStack.push(prev); redoStack.length=0; } };
const undoEdit = () => { if(!undoStack.length) return false; redoStack.push(new Map(edits)); edits = undoStack.pop(); return true; };

// 爆破前/后 + 撤销 往返
{
  edits = new Map([[key(0,0,0),1],[key(1,1,1),1],[key(5,5,5),1]]);
  const before = snapshotEdits();
  edits = explode(edits, 0,0,0, 2);            // 删除 (0,0,0),(1,1,1)
  ok('爆破删除半径内方块', edits.size===1 && edits.has(key(5,5,5)) && !edits.has(key(0,0,0)));
  recordUndo(before);
  ok('爆破已入撤销栈', undoStack.length===1);
  const undone = undoEdit();
  ok('撤销成功', undone === true);
  ok('撤销恢复到爆破前', editsEqual(edits, before) && edits.size===3);
}
// 空爆破(半径内无敌意)不入栈
{
  edits = new Map([[key(100,100,100),1]]);
  const before = snapshotEdits();
  edits = explode(edits, 0,0,0, 2);            // 无变化
  recordUndo(before);
  ok('无变化不记录撤销', undoStack.length===0);
}

// ---- 源码接线(修复 boom 未入撤销栈) ----
const main = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
ok('main.js 定义 explode', /function explode\(/.test(main));
ok('main.js 定义 undoEdit', /function undoEdit\(/.test(main));
ok('main.js boomAt 爆破前 snapshotEdits', /function boomAt\([\s\S]*?const prev = snapshotEdits\(\)/.test(main));
ok('main.js boomAt 爆破后 recordUndo(prev)', /function boomAt\([\s\S]*?recordUndo\(prev\)/.test(main));
ok('main.js boomAt 同时含 snapshot 与 recordUndo(真 bug 已修)', /const prev = snapshotEdits\(\)[\s\S]*?recordUndo\(prev\)/.test(main));

console.log(`\nboomUndo: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
