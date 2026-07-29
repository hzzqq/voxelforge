// _ci462_deserialize_test.js — ci462：deserializeWorld 键值校验加固(隐性修复) + 读档/导入进撤销栈的源码接线审计
// 根因1：toMap 不校验键值——损坏/恶意 JSON（坏键 "x,y"、非整数坐标、对象值、NaN）直接污染 edits/waterCol/lavaCol。
// 根因2：读档/导入替换 edits 后 undoStack 保留旧世界快照，Ctrl+Z 一步弹回旧世界、吞掉整个新档且 redo 栈错乱。
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  FAIL', n); } };

// brace-count 抽取器（CRLF 免疫）
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('找不到函数 ' + name);
  let d = 0; const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('括号不配平 ' + name);
}
const deserializeWorld = eval('(' + extract('deserializeWorld') + ')');
const serializeWorld = eval('(' + extract('serializeWorld') + ')');

// ---- 合法数据往返 ----
const edits = new Map([['1,2,3', 0xff0000], ['0,0,0', null], ['-4,5,-6', 0x00ff00]]);
const water = new Map([['1,2', 8], ['-3,4', 5]]);
const lava = new Map([['0,1', 3]]);
const rt = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(edits, water, lava))));
ok('ci462 合法往返 edits 3 条', rt.edits.size === 3 && rt.edits.get('1,2,3') === 0xff0000);
ok('ci462 null 挖空占位保留', rt.edits.has('0,0,0') && rt.edits.get('0,0,0') === null);
ok('ci462 负坐标键保留', rt.edits.get('-4,5,-6') === 0x00ff00);
ok('ci462 water/lava 往返', rt.waterCol.get('1,2') === 8 && rt.lavaCol.get('0,1') === 3);

// ---- 损坏数据全部被拒 ----
const bad = deserializeWorld({
  edits: [
    ['1,2', 5],            // 键段数错误（2 段，应 3 段）
    ['a,b,c', 5],          // 非数字坐标
    ['1.5,2,3', 5],        // 非整数坐标
    ['1,2,3,4', 5],        // 4 段
    [{}, 5],               // 键非字符串
    ['4,5,6', {}],         // 值为对象
    ['7,8,9', NaN],        // 值 NaN
    ['1,2,', 5],           // 空段
    'notArray',            // 条目非数组
    ['10,11,12', 7]        // 唯一合法条目
  ],
  water: [['1,2,3', 5], ['x,y', 1], ['3,4', Infinity], ['5,6', 2]],
  lava: [['7,8', null], ['9,10', 4]]
});
ok('ci462 edits 仅 1 条合法保留', bad.edits.size === 1 && bad.edits.get('10,11,12') === 7);
ok('ci462 water 拒绝 3 段键/坏键/Infinity', bad.waterCol.size === 1 && bad.waterCol.get('5,6') === 2);
ok('ci462 lava 拒绝 null 值(流体无挖空语义)', bad.lavaCol.size === 1 && bad.lavaCol.get('9,10') === 4);

// ---- 根部损坏回退空世界 ----
ok('ci462 非对象输入回退空', deserializeWorld(null).edits.size === 0);
ok('ci462 edits 非数组回退空', deserializeWorld({ edits: 'x' }).edits.size === 0);

// ---- 源码接线审计：读档(loadW)与文件导入(worldFile)路径都必须 recordUndo(prevEdits) ----
// 抓取两个 UI 回调段并断言接线存在且顺序正确（先替换 edits 再 recordUndo）
const loadSeg = src.slice(src.indexOf("$('loadW').onclick"), src.indexOf("$('loadW').onclick") + 1600);
const importSeg = src.slice(src.indexOf("$('worldFile').onchange"), src.indexOf("$('worldFile').onchange") + 1800);
for (const [name, seg] of [['loadW 读档', loadSeg], ['worldFile 导入', importSeg]]) {
  const iSnap = seg.indexOf('snapshotEdits()');
  const iAssign = seg.indexOf('edits = w.edits');
  const iRec = seg.indexOf('recordUndo(prevEdits)');
  ok(`ci462 ${name}：加载前快照旧世界`, iSnap >= 0);
  ok(`ci462 ${name}：recordUndo 接线存在`, iRec >= 0);
  ok(`ci462 ${name}：顺序 快照→替换→入栈`, iSnap >= 0 && iAssign > iSnap && iRec > iAssign);
}

// ---- 回归：recordUndo 语义（prev != 当前才入栈，redo 被清）----
{
  // 模拟 recordUndo 所需的闭包环境
  const UNDO_CAP = 64;
  let undoStack = [], redoStack = [{ fake: 1 }];
  let curEdits = new Map([['10,11,12', 7]]);
  const editsEqual = eval('(' + extract('editsEqual') + ')');
  const prev = new Map([['1,2,3', 5]]);
  // recordUndo 逻辑内联复刻（依赖全局 edits，无法直接 eval 复用）
  if (prev && !editsEqual(prev, curEdits)) { undoStack.push(prev); if (undoStack.length > UNDO_CAP) undoStack.shift(); redoStack.length = 0; }
  ok('ci462 回归：不同世界入撤销栈且 redo 清空', undoStack.length === 1 && redoStack.length === 0);
}

console.log(`\n_ci462_deserialize: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
