// Counts scene-graph work in the same deterministic test fixture. These are
// operation counts, not Figma frame-rate measurements.
const fs = require('node:fs');
const vm = require('node:vm');
const esbuild = require('esbuild');
const { createFigma } = require('../tests/figma-mock.cjs');
const style = { route: 'elbow', color: '#2563eb', weight: 2, arrows: 'end', dashed: false, label: 'Success', diagram: 'decision', diagramText: 'Valid?' };
async function run(path) {
  const figma = createFigma();
  const code = esbuild.transformSync(fs.readFileSync(path, 'utf8'), { loader: 'ts', target: 'es2017' }).code;
  vm.runInNewContext(code, { figma, __html__: '', setTimeout, clearTimeout });
  const send = message => figma.ui.onmessage(message);
  const choose = async n => { figma.currentPage.selection = [n]; await new Promise(r => setTimeout(r, 0)); };
  try {
    await send({ type: 'ready' }); await send({ type: 'anchors', mode: 'selection' });
    const a = figma.createFrame(), b = figma.createFrame(); a.resize(240, 180); b.resize(240, 180); b.x = 500; b.y = 80;
    await send({ type: 'start', style }); await choose(a); await send({ type: 'port', side: 'right' });
    await choose(b); await send({ type: 'port', side: 'left' }); await send({ type: 'stop' });
    const count = figma.nodes.size; let lookups = 0;
    const get = figma.getNodeByIdAsync;
    figma.getNodeByIdAsync = id => { lookups++; return get(id); };
    for (let i = 0; i < 100; i++) { b.x += 3; b.y += 1; await send({ type: 'refresh' }); }
    return { updates: 100, createdNodes: figma.nodes.size - count, endpointLookups: lookups };
  } finally { figma.emit('close'); }
}
(async () => {
  const result = { current: await run('code.ts'), scope: 'Mock operation counts only; not editor FPS or latency.' };
  fs.writeFileSync('docs/performance.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
})();
