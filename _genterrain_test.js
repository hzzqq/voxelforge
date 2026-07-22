// 测试：genTerrain（程序化地形生成）—— 纯函数 + 接线校验
const assert = require('assert');
const fs = require('fs');

// 从 main.js 忠实移植纯函数（必须与生产实现保持一致）
function hash2(x, z, seed){
  let h = (Math.imul(x|0, 374761393) + Math.imul(z|0, 668265263) + Math.imul(seed|0, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x, z, seed, freq){
  const fx = x / freq, fz = z / freq;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fx - x0, tz = fz - z0;
  const v00 = hash2(x0, z0, seed),   v10 = hash2(x0+1, z0, seed);
  const v01 = hash2(x0, z0+1, seed), v11 = hash2(x0+1, z0+1, seed);
  const sx = tx*tx*(3-2*tx), sz = tz*tz*(3-2*tz);
  const a = v00 + (v10 - v00)*sx, b = v01 + (v11 - v01)*sx;
  return a + (b - a)*sz;
}
const PALETTE = { grass: 0x6ab04c, dirt: 0x8a5a2b, stone: 0x8d949c };
function genTerrain(seed, size, key, PALETTEv){
  size = Math.max(1, size|0);
  const edits = new Map();
  const heights = [];
  let minH = Infinity, maxH = -Infinity;
  const base = 8, noiseAmp = 12, fill = 3;
  for(let x = 0; x < size; x++){
    heights[x] = [];
    for(let z = 0; z < size; z++){
      let n = valueNoise(x, z, seed, 16) * 0.6
            + valueNoise(x, z, seed, 6) * 0.3
            + valueNoise(x, z, seed, 3) * 0.1;
      const h = base + Math.floor(n * noiseAmp);
      heights[x][z] = h;
      if(h < minH) minH = h; if(h > maxH) maxH = h;
      for(let y = h - fill; y <= h; y++){
        let color;
        if(y === h) color = PALETTEv.grass;
        else if(y >= h - 1) color = PALETTEv.dirt;
        else color = PALETTEv.stone;
        edits.set(key(x, y, z), color);
      }
    }
  }
  return { edits, heights, minH, maxH, size };
}
const key = (x,y,z) => x + ',' + y + ',' + z;

// 1) 确定性：同种子 → 同结果
{
  const a = genTerrain(12345, 16, key, PALETTE);
  const b = genTerrain(12345, 16, key, PALETTE);
  assert.deepStrictEqual([...a.edits.entries()].sort(), [...b.edits.entries()].sort(), '同种子必须完全确定');
}

// 2) 不同种子通常产生不同地形（高度图有差异）
{
  const a = genTerrain(1, 16, key, PALETTE);
  const b = genTerrain(2, 16, key, PALETTE);
  let diff = 0;
  for(let x=0; x<16; x++) for(let z=0; z<16; z++) if(a.heights[x][z] !== b.heights[x][z]) diff++;
  assert.ok(diff > 0, '不同种子应产生不同地形');
}

// 3) 高度有界且随尺寸缩放：edits 体积基本等于 size*size*(fill+1)
{
  const S = 20, fill = 3;
  const r = genTerrain(7, S, key, PALETTE);
  assert.strictEqual(r.edits.size, S * S * (fill + 1), '体素数应为 size²×(回填+1)');
  assert.ok(r.minH >= 8 && r.maxH <= 8 + 12 + 1, '高度应在合理范围 [' + r.minH + ',' + r.maxH + ']');
  assert.ok(r.maxH > r.minH, '地形应有起伏');
}

// 4) 地表颜色分配：顶层草、其下泥、更深石
{
  const r = genTerrain(42, 8, key, PALETTE);
  const S = 8;
  for(let x=0; x<S; x++) for(let z=0; z<S; z++){
    const h = r.heights[x][z];
    assert.strictEqual(r.edits.get(key(x, h, z)), PALETTE.grass, '顶层应为草');
    assert.strictEqual(r.edits.get(key(x, h-1, z)), PALETTE.dirt, '次顶层应为泥');
    assert.strictEqual(r.edits.get(key(x, h-3, z)), PALETTE.stone, '最底应为石');
  }
}

// 5) 接线校验：main.js 实现 genTerrain + 按钮 + 撤销；index.html 有按钮
const main = fs.readFileSync(__dirname + '/main.js', 'utf8');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
assert.ok(main.includes('function genTerrain('), 'main.js 缺少 genTerrain');
assert.ok(main.includes("$('genTerrainBtn').onclick"), 'main.js 缺少 genTerrainBtn 处理器');
assert.ok(main.includes('snapshotEdits()'), 'genTerrain 未接入撤销快照');
assert.ok(main.includes('recordUndo(prev)'), 'genTerrain 未记录撤销');
assert.ok(html.includes('<button id="genTerrainBtn">⛰ 生成程序化地形</button>'), 'index.html 缺少 genTerrainBtn');

console.log('genTerrain 测试通过：5 组断言 OK');
