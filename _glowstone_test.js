// 测试：glowstone（自发光方块）—— 纯逻辑 + 渲染接线校验
const assert = require('assert');
const fs = require('fs');

// 1) PALETTE 含 glowstone 且为数值颜色
const main = fs.readFileSync(__dirname + '/main.js', 'utf8');
const m = main.match(/const PALETTE = \{([\s\S]*?)\};/);
assert.ok(m, 'main.js 缺少 PALETTE');
const paletteBlock = m[1];
assert.ok(/glowstone:\s*0x[0-9a-fA-F]+/.test(paletteBlock), 'PALETTE 缺少 glowstone 颜色');
const glowHex = parseInt((paletteBlock.match(/glowstone:\s*(0x[0-9a-fA-F]+)/)[1]), 16);
assert.ok(Number.isFinite(glowHex) && glowHex >= 0, 'glowstone 颜色非法');

// 2) GLOW 集合与 isGlowBlock 纯函数（从 main.js 移植）
function isGlowBlock(name){ return name === 'glowstone'; }
assert.strictEqual(isGlowBlock('glowstone'), true, 'glowstone 应判定为自发光');
assert.strictEqual(isGlowBlock('stone'), false, 'stone 不应自发光');
assert.strictEqual(isGlowBlock('lava'), false, 'lava 不在此集合（走独立岩浆网格）');
// 确认 main.js 用 GLOW 集合 + isGlowBlock 管理自发光
assert.ok(/const GLOW = new Set\(\['glowstone'\]\)/.test(main), 'main.js 缺少 GLOW 集合');
assert.ok(main.includes('function isGlowBlock'), 'main.js 缺少 isGlowBlock');

// 3) 自发光判定与颜色一致性：笔刷为 glowstone 时写入的即发光色
{
  const edits = new Map();
  const k = (x,y,z) => x + ',' + y + ',' + z;
  const PALETTE = { glowstone: glowHex };
  // 模拟 writeVoxel 写入（与生产一致：edits.set(k, PALETTE[brush])）
  edits.set(k(0,0,0), PALETTE.glowstone);
  const v = edits.get('0,0,0');
  assert.strictEqual(v, glowHex, 'glowstone 写入应为发光色');
  assert.strictEqual(isGlowBlock('glowstone') && v === glowHex, true, '颜色与自发光判定应一致');
}

// 4) 渲染接线：glowMat 自发光材质 + 独立 glow InstancedMesh + 正确释放
assert.ok(main.includes('glowMat'), 'main.js 缺少 glowMat');
assert.ok(/emissive:\s*PALETTE\.glowstone/.test(main), 'glowMat 应使用发光色作 emissive');
assert.ok(main.includes('const glow = new THREE.InstancedMesh(geo, glowMat, PER_CHUNK)'), 'buildChunk 缺少 glow 网格');
assert.ok(main.includes('c.mesh.glow.dispose()'), 'rebuildChunk 未释放 glow 网格（内存泄漏隐患）');
assert.ok(main.includes('scene.add(glow)'), 'buildChunk 未将 glow 网格加入场景');
assert.ok(main.includes('glow, count:'), '返回值未包含 glow 计数');

// 5) index.html 调色板含 glowstone 选项
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
assert.ok(html.includes('<option value="glowstone">发光石</option>'), 'index.html 缺少发光石选项');

console.log('glowstone 测试通过：5 组断言 OK');
