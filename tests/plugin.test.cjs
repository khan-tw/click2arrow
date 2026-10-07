const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const esbuild = require('esbuild');
const { createFigma } = require('./figma-mock.cjs');
const code = esbuild.transformSync(fs.readFileSync('code.ts', 'utf8'), { loader: 'ts', target: 'es2017' }).code;
const defaults = { route: 'elbow', color: '#2563eb', weight: 2, arrows: 'end', dashed: false, label: '', diagram: 'none', diagramText: '' };
const tick = () => new Promise(r => setTimeout(r, 0));
async function setup(mode = 'selection') {
  const figma = createFigma(), messages = [];
  figma.ui.postMessage = m => messages.push(m);
  vm.runInNewContext(code, { figma, __html__: '', setTimeout, clearTimeout });
  const send = m => figma.ui.onmessage(m);
  await send({ type: 'ready' });
  if (mode !== null) await send({ type: 'anchors', mode });
  const a = figma.createFrame(); a.name = 'Screen A'; a.resize(240, 180); a.x = 80; a.y = 100;
  const b = figma.createFrame(); b.name = 'Screen B'; b.resize(240, 180); b.x = 580; b.y = 180;
  const choose = async n => { figma.currentPage.selection = [n]; await tick(); };
  const state = () => messages[messages.length - 1];
  const edges = () => figma.currentPage.children.filter(n => n.getPluginData('c2a-role') === 'edge');
  const dots = () => figma.currentPage.children.filter(n => n.getPluginData('c2a-role') === 'handle');
  const connect = async (style = defaults) => {
    await send({ type: 'start', style }); await choose(a); await send({ type: 'port', side: 'right' }); await tick();
    await choose(b); await send({ type: 'port', side: 'left' }); await tick(); return edges().at(-1);
  };
  return { figma, send, a, b, choose, state, edges, dots, connect };
}
test('native selection -> four anchors -> connection; original frames stay untouched', async () => {
  const x = await setup(), before = JSON.stringify([x.a, x.b].map(n => [n.x, n.y, n.width, n.height, n.fills, n.parent.id]));
  await x.send({ type: 'start', style: defaults }); await x.choose(x.a);
  assert.equal(x.dots().length, 4);
  const right = x.dots().find(n => n.name.endsWith('right')); await x.choose(right); await tick();
  assert.equal(x.state().source.side, 'right'); await x.choose(x.b);
  const left = x.dots().find(n => n.name.endsWith('left')); await x.choose(left); await tick(); await tick();
  assert.equal(x.edges().length, 1); assert.equal(x.state().drawing, true); assert.equal(x.dots().length, 0);
  assert.equal(before, JSON.stringify([x.a, x.b].map(n => [n.x, n.y, n.width, n.height, n.fills, n.parent.id])));
  x.figma.emit('close');
});
test('same-object connection is rejected and cancel/stop remove temporary anchors', async () => {
  const x = await setup(); await x.send({ type: 'start', style: defaults }); await x.choose(x.a);
  await x.send({ type: 'port', side: 'right' }); await tick(); await x.choose(x.a); await x.send({ type: 'port', side: 'left' });
  assert.equal(x.edges().length, 0); assert.equal(x.state().error, true);
  await x.send({ type: 'cancel' }); assert.equal(x.state().source, null); assert.equal(x.dots().length, 0);
  await x.choose(x.b); await x.send({ type: 'stop' }); assert.equal(x.dots().length, 0); assert.equal(x.state().drawing, false); x.figma.emit('close');
});
test('annotation edits, branching from Decision, and moving a frame retain diagram identity', async () => {
  const x = await setup(); const edge = await x.connect({ ...defaults, label: 'Success', diagram: 'decision', diagramText: 'Verified?' });
  const diagram = edge.children.find(n => n.getPluginData('c2a-role') === 'diagram'); assert.ok(diagram);
  assert.ok(edge.children.some(n => n.name === 'Flow label'));
  const previous = edge.width; x.b.x += 260; await x.send({ type: 'refresh' });
  assert.equal(edge.children.find(n => n.getPluginData('c2a-role') === 'diagram').id, diagram.id);
  assert.ok(edge.width > previous);
  await x.choose(diagram); assert.equal(x.dots().length, 4);
  await x.send({ type: 'port', side: 'bottom' }); await tick(); await x.choose(x.a); await x.send({ type: 'port', side: 'bottom' }); await tick();
  assert.equal(x.edges().length, 2);
  const second = x.edges()[1]; assert.equal(JSON.parse(second.getPluginData('click2arrow.v1')).source.id, diagram.id);
  await x.send({ type: 'stop' }); await x.choose(edge);
  await x.send({ type: 'apply', style: { ...defaults, label: 'Failure', route: 'curve', arrows: 'both', dashed: true } });
  assert.equal(JSON.parse(edge.getPluginData('click2arrow.v1')).style.label, 'Failure');
  assert.equal(edge.children.filter(n => n.name === 'Arrowhead').length, 2); x.figma.emit('close');
});
test('moving nested / rotated frames uses absolute side midpoints', async () => {
  const x = await setup(); const container = x.figma.createFrame(); container.x = 120; container.y = 70; container.rotation = 30; container.appendChild(x.a);
  await x.send({ type: 'start', style: defaults }); await x.choose(x.a);
  const dot = x.dots().find(n => n.name.endsWith('right'));
  const t = x.a.absoluteTransform, expected = { x: t[0][0] * x.a.width + t[0][1] * x.a.height / 2 + t[0][2], y: t[1][0] * x.a.width + t[1][1] * x.a.height / 2 + t[1][2] };
  assert.ok(Math.abs(dot.x + dot.width / 2 - expected.x) < 0.01); assert.ok(Math.abs(dot.y + dot.height / 2 - expected.y) < 0.01);
  await x.send({ type: 'port', side: 'right' }); await tick(); await x.choose(x.b); await x.send({ type: 'port', side: 'left' });
  assert.equal(x.a.parent.id, container.id); assert.equal(x.edges().length, 1); x.figma.emit('close');
});
test('geometry follows both coordinates even when a page change notification is missed', async () => {
  const x = await setup();
  try {
    const edge = await x.connect({ ...defaults, diagram: 'decision', diagramText: 'Valid?' });
    const diagramId = edge.children.find(n => n.getPluginData('c2a-role') === 'diagram').id;
    await x.send({ type: 'stop' });
    const oldWidth = edge.width;
    x.b.x += 220; x.b.y += 180;
    // Deliberately send no nodechange and do not use the Refresh action.
    await new Promise(resolve => setTimeout(resolve, 760));
    const line = edge.children.find(n => n.name === 'Flow arrow');
    const coords = line.vectorPaths[0].data.match(/-?[\d.]+/g).map(Number);
    assert.ok(edge.width > oldWidth);
    assert.equal(coords.at(-2) + line.x + edge.x, x.b.x);
    assert.equal(coords.at(-1) + line.y + edge.y, x.b.y + x.b.height / 2);
    assert.equal(edge.children.find(n => n.getPluginData('c2a-role') === 'diagram').id, diagramId);
  } finally { x.figma.emit('close'); }
});
test('page changes and closing remove anchors; in-flight creation cannot finish after close', async () => {
  const x = await setup(); await x.send({ type: 'start', style: defaults }); await x.choose(x.a);
  const old = x.figma.currentPage, p = new x.figma.Node('PAGE'); x.figma.root.appendChild(p); x.figma.changePage(p);
  assert.equal(old.children.filter(n => n.getPluginData('c2a-role') === 'handle').length, 0); assert.equal(x.state().source, null);
  x.figma.changePage(old); await x.choose(x.a); await x.send({ type: 'port', side: 'right' }); await tick(); await x.choose(x.b);
  let release; x.figma.loadFontAsync = () => new Promise(r => release = r);
  const pending = x.send({ type: 'port', side: 'left' }); x.figma.emit('close'); release(); await pending;
  assert.equal(x.edges().length, 0); assert.equal(x.dots().length, 0);
});
test('deleted endpoints preserve the annotation and report the stale connection', async () => {
  const x = await setup(); const edge = await x.connect(); x.b.remove(); await x.send({ type: 'refresh' });
  assert.equal(edge.removed, false);
  assert.equal(x.state().error, true); assert.match(x.state().message, /已保留/);
  await x.send({ type: 'stop' }); await x.choose(edge); await x.send({ type: 'apply', style: defaults });
  assert.equal(x.state().error, true); assert.match(x.state().message, /刪除/); x.figma.emit('close');
});
test('style inputs are bounded; deleting only removes the selected owned arrow', async () => {
  const x = await setup(); const edge = await x.connect({ ...defaults, weight: 99, color: 'bad', label: 'x'.repeat(1000) });
  const e = JSON.parse(edge.getPluginData('click2arrow.v1')); assert.equal(e.style.weight, 8); assert.equal(e.style.color, '#2563eb'); assert.equal(e.style.label.length, 180);
  await x.send({ type: 'delete' }); assert.equal(x.edges().length, 0); assert.equal(x.a.removed, false); assert.equal(x.b.removed, false); x.figma.emit('close');
});
test('elbow routing keeps the middle path outside both endpoint rectangles', async () => {
  const x = await setup(); x.b.x = 150; x.b.y = 480;
  const edge = await x.connect(); const line = edge.children.find(n => n.name === 'Flow arrow');
  const nums = line.vectorPaths[0].data.match(/-?[\d.]+/g).map(Number), pts = [];
  for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i] + line.x + edge.x, y: nums[i + 1] + line.y + edge.y });
  for (let i = 2; i < pts.length - 1; i++) {
    const mid = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
    for (const n of [x.a, x.b]) assert.ok(!(mid.x > n.x && mid.x < n.x + n.width && mid.y > n.y && mid.y < n.y + n.height));
  }
  x.figma.emit('close');
});

test('direct mode connects two canvas ports without selecting either object', async () => {
  const x = await setup('visible');
  try {
    await x.send({ type: 'start', style: defaults });
    assert.equal(x.figma.currentPage.selection.length, 0);
    assert.equal(x.dots().length, 8);
    const right = x.dots().find(n => n.x + n.width / 2 === x.a.x + x.a.width && n.name.endsWith('right'));
    const left = x.dots().find(n => n.x + n.width / 2 === x.b.x && n.name.endsWith('left'));
    const ids = x.dots().map(n => n.id);
    await x.choose(right); await x.choose(left); await tick();
    assert.equal(x.edges().length, 1);
    assert.deepEqual(x.dots().map(n => n.id), ids);
    assert.equal(x.figma.currentPage.selection.length, 0);
    await x.send({ type: 'cancel' }); assert.equal(x.state().source, null); assert.equal(x.dots().length, 8);
    await x.send({ type: 'stop' }); assert.equal(x.dots().length, 0);
  } finally { x.figma.emit('close'); }
});

test('visible ports respect viewport, visibility, sections and the 40-object limit', async () => {
  const x = await setup('visible');
  try {
    x.figma.viewport.bounds = { x: 0, y: 0, width: 1000, height: 1000 };
    const section = new x.figma.Node('SECTION'); x.figma.currentPage.appendChild(section); section.appendChild(x.a);
    x.b.x = 2000;
    await x.send({ type: 'start', style: defaults }); assert.equal(x.dots().length, 4);
    section.visible = false; await x.send({ type: 'refresh' }); assert.equal(x.dots().length, 0);
    for (let i = 0; i < 45; i++) x.figma.createFrame();
    await x.send({ type: 'refresh' }); assert.equal(x.dots().length, 160); assert.equal(x.state().anchorLimit, true);
    x.figma.viewport.bounds.x = 1900; await x.send({ type: 'refresh' }); assert.equal(x.dots().length, 4);
    await x.send({ type: 'anchors', mode: 'selection' }); assert.equal(x.dots().length, 0);
  } finally { x.figma.emit('close'); }
});

test('100 position updates preserve all arrow parts and allocate zero scene nodes', async () => {
  const x = await setup();
  try {
    const edge = await x.connect({ ...defaults, diagram: 'decision', label: 'Success', diagramText: 'Valid?' });
    await x.send({ type: 'stop' });
    const ids = n => [n.id, ...n.children.flatMap(ids)];
    const before = ids(edge), allocated = x.figma.nodes.size;
    let lookups = 0; const get = x.figma.getNodeByIdAsync;
    x.figma.getNodeByIdAsync = id => { lookups++; return get(id); };
    for (let i = 0; i < 100; i++) { x.b.x += 3; x.b.y += 1; await x.send({ type: 'refresh' }); }
    assert.deepEqual(ids(edge), before);
    assert.equal(x.figma.nodes.size - allocated, 0);
    assert.equal(lookups, 0);
  } finally { x.figma.emit('close'); }
});

test('continuous change events are throttled and do not postpone every update until dragging ends', async () => {
  const x = await setup();
  try {
    const edge = await x.connect(); await x.send({ type: 'stop' }); const before = edge.width;
    for (let i = 0; i < 6; i++) { x.b.x += 10; x.figma.nodeChange(); await new Promise(r => setTimeout(r, 10)); }
    assert.ok(edge.width > before);
  } finally { x.figma.emit('close'); }
});

test('reversing swaps saved endpoints and preserves labels, shape and original frames', async () => {
  const x = await setup();
  try {
    const edge = await x.connect({ ...defaults, label: 'Confirm', diagram: 'process' });
    const original = JSON.parse(edge.getPluginData('click2arrow.v1'));
    const line = edge.children.find(n => n.name === 'Flow arrow');
    await x.send({ type: 'reverse' });
    const reversed = JSON.parse(edge.getPluginData('click2arrow.v1'));
    assert.deepEqual(reversed.source, original.target); assert.deepEqual(reversed.target, original.source);
    assert.deepEqual(reversed.style, original.style); assert.equal(edge.children.find(n => n.name === 'Flow arrow').id, line.id);
    assert.equal(x.a.x, 80); assert.equal(x.b.x, 580);
  } finally { x.figma.emit('close'); }
});

test('hidden endpoints resume synchronization after being shown again', async () => {
  const x = await setup();
  try {
    const edge = await x.connect(); const width = edge.width;
    x.b.visible = false; await x.send({ type: 'refresh' }); assert.equal(x.state().error, true);
    x.b.visible = true; x.b.x += 400; x.figma.nodeChange(); await new Promise(r => setTimeout(r, 70));
    assert.ok(edge.width > width);
  } finally { x.figma.emit('close'); }
});


test('Draw defaults to one selected object and never populates all visible ports implicitly', async () => {
  const x = await setup(null);
  try {
    await x.send({ type: 'start', style: defaults });
    assert.equal(x.state().anchorMode, 'selection');
    assert.equal(x.dots().length, 0);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(x.dots().length, 0);
    await x.choose(x.a); assert.equal(x.dots().length, 4);
    await x.choose(x.b); assert.equal(x.dots().length, 4);
    for (const dot of x.dots()) {
      const cx = dot.x + dot.width / 2, cy = dot.y + dot.height / 2;
      assert.ok(cx >= x.b.x && cx <= x.b.x + x.b.width);
      assert.ok(cy >= x.b.y && cy <= x.b.y + x.b.height);
    }
    x.figma.currentPage.selection = []; await tick(); assert.equal(x.dots().length, 0);
  } finally { x.figma.emit('close'); }
});

const annotationOptions = { title: 'Review range', text: 'Explain this part of the flow.\nSecond line.', color: '#d97706', position: 'right', padding: 16, noteWidth: 240 };
const annotations = x => x.figma.currentPage.children.filter(n => n.getPluginData('c2a-role') === 'annotation');
const annotationPart = (n, key) => n.children.find(c => c.getPluginData('c2a-part') === key);
const annotationData = n => JSON.parse(n.getPluginData('click2arrow.annotation.v1'));
async function annotate(x, nodes = [x.a, x.b], options = annotationOptions, mode = 'selection') {
  await x.send({ type: 'workflow', value: 'annotations' });
  x.figma.currentPage.selection = nodes; await tick();
  await x.send({ type: 'annotation-create', mode, options }); await tick();
  return annotations(x).at(-1);
}
test('range annotation encloses native selection, creates a numbered dashed border and preserves originals', async () => {
  const x = await setup();
  try {
    const original = JSON.stringify([x.a, x.b].map(n => [n.id, n.x, n.y, n.width, n.height, n.parent.id, n.fills]));
    const frame = await annotate(x), border = annotationPart(frame, 'annotation-border');
    assert.deepEqual(border.absoluteBoundingBox, { x: 64, y: 84, width: 772, height: 292 });
    assert.equal(border.fills.length, 0); assert.deepEqual(Array.from(border.dashPattern), [8, 5]);
    const note = annotationPart(frame, 'annotation-note');
    assert.equal(note.absoluteBoundingBox.x, border.absoluteBoundingBox.x + border.width + 24);
    assert.equal(annotationPart(note, 'annotation-text').characters, annotationOptions.text);
    assert.equal(annotationPart(annotationPart(frame, 'annotation-badge'), 'annotation-number').characters, '01');
    assert.equal(annotationData(frame).number, 1); assert.equal(x.figma.currentPage.selection[0], frame);
    assert.equal(x.figma.undoCount, 1);
    assert.equal(original, JSON.stringify([x.a, x.b].map(n => [n.id, n.x, n.y, n.width, n.height, n.parent.id, n.fills])));
  } finally { x.figma.emit('close'); }
});
test('rectangle conversion uses exact absolute range and consumes only the explicit rectangle', async () => {
  const x = await setup();
  try {
    const rect = x.figma.createRectangle(); x.a.appendChild(rect); rect.x = 25; rect.y = 40; rect.resize(90, 60); rect.rotation = 15;
    const box = rect.absoluteBoundingBox;
    const frame = await annotate(x, [rect], annotationOptions, 'rectangle');
    assert.equal(rect.removed, true); assert.equal(x.a.removed, false); assert.equal(x.b.removed, false);
    const actual = annotationPart(frame, 'annotation-border').absoluteBoundingBox;
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[key] - box[key]) < .001);
    assert.equal(x.a.parent, x.figma.currentPage);
  } finally { x.figma.emit('close'); }
});
test('annotation edits preserve IDs, rotated range position and number; native text edits survive reopening', async () => {
  const x = await setup();
  try {
    const frame = await annotate(x), border = annotationPart(frame, 'annotation-border'), note = annotationPart(frame, 'annotation-note');
    frame.rotation = 23; frame.x += 100; frame.y -= 30; border.resize(400, 300);
    const box = border.absoluteBoundingBox;
    const body = annotationPart(note, 'annotation-text'); body.characters = 'Edited directly on canvas';
    await x.choose(body); assert.equal(x.state().annotation.options.text, body.characters);
    await x.send({ type: 'annotation-apply', options: { ...annotationOptions, text: body.characters, position: 'left', noteWidth: 300 } });
    assert.equal(annotationPart(frame, 'annotation-border'), border); assert.equal(annotationPart(frame, 'annotation-note'), note);
    assert.equal(annotationPart(note, 'annotation-text'), body); assert.equal(frame.rotation, 23);
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(border.absoluteBoundingBox[key] - box[key]) < .001);
    assert.equal(annotationData(frame).number, 1); assert.equal(x.figma.currentPage.getPluginData('c2a-annotation-next'), '2');
    x.figma.emit('close');
    vm.runInNewContext(code, { figma: x.figma, __html__: '', setTimeout, clearTimeout });
    await x.figma.ui.onmessage({ type: 'ready' });
    assert.equal(x.state().workflow, 'annotations'); assert.equal(x.state().annotation.options.text, 'Edited directly on canvas');
    assert.equal(x.state().annotation.number, 1);
  } finally { x.figma.emit('close'); }
});
test('annotation deletion is scoped and numbering continues after deletion and imported higher numbers', async () => {
  const x = await setup();
  try {
    const first = await annotate(x); await x.send({ type: 'annotation-delete' });
    assert.equal(first.removed, true); assert.equal(x.a.removed, false); assert.equal(x.b.removed, false);
    const second = await annotate(x); assert.equal(annotationData(second).number, 2);
    second.setPluginData('click2arrow.annotation.v1', JSON.stringify({ ...annotationData(second), number: 20 }));
    const third = await annotate(x); assert.equal(annotationData(third).number, 21);
    await x.choose(x.a); await x.send({ type: 'annotation-delete' });
    assert.equal(third.removed, false); assert.equal(x.a.removed, false); assert.equal(x.state().error, true);
  } finally { x.figma.emit('close'); }
});
test('invalid ranges and unsafe rectangle conversion leave the page untouched', async () => {
  const x = await setup();
  try {
    const rect = x.figma.createRectangle(), count = x.figma.nodes.size;
    await annotate(x, [rect], { ...annotationOptions, text: '   ' }, 'rectangle');
    assert.equal(annotations(x).length, 0); assert.equal(rect.removed, false); assert.equal(x.figma.nodes.size, count);
    x.a.layoutMode = 'HORIZONTAL'; x.a.appendChild(rect);
    await annotate(x, [rect], annotationOptions, 'rectangle'); assert.equal(rect.removed, false); assert.equal(annotations(x).length, 0);
    x.a.layoutMode = 'NONE'; x.a.type = 'INSTANCE';
    await annotate(x, [rect], annotationOptions, 'rectangle'); assert.equal(annotations(x).length, 0);
    x.figma.currentPage.appendChild(rect); rect.locked = true;
    await annotate(x, [rect], annotationOptions, 'rectangle'); assert.equal(rect.removed, false); assert.equal(annotations(x).length, 0);
    await annotate(x, [], annotationOptions); assert.equal(annotations(x).length, 0);
    await annotate(x, [x.b], annotationOptions, 'rectangle'); assert.equal(x.b.removed, false);
    x.b.width = Infinity; await annotate(x, [x.b]); assert.equal(annotations(x).length, 0);
  } finally { x.figma.emit('close'); }
});
test('annotation creation is cancelled across page changes, close or font failure without consuming the rectangle', async () => {
  for (const stop of ['page', 'close', 'font']) {
    const x = await setup();
    try {
      const originalPage = x.figma.currentPage, rect = x.figma.createRectangle();
      await x.send({ type: 'workflow', value: 'annotations' }); await x.choose(rect);
      let finish;
      x.figma.loadFontAsync = () => new Promise((resolve, reject) => { finish = stop === 'font' ? () => reject(new Error('Font unavailable')) : resolve; });
      const pending = x.send({ type: 'annotation-create', mode: 'rectangle', options: annotationOptions });
      if (stop === 'page') { const p = new x.figma.Node('PAGE'); x.figma.root.appendChild(p); x.figma.changePage(p); }
      if (stop === 'close') x.figma.emit('close');
      finish(); await pending;
      assert.equal(rect.removed, false); assert.equal(originalPage.children.filter(n => n.getPluginData('c2a-role') === 'annotation').length, 0);
      assert.equal(x.figma.undoCount, 0);
    } finally { x.figma.emit('close'); }
  }
});
test('annotation workflow clears arrow ports, and annotations never become arrow endpoints', async () => {
  const x = await setup('visible');
  try {
    await x.send({ type: 'start', style: defaults }); assert.ok(x.dots().length);
    const frame = await annotate(x); assert.equal(x.dots().length, 0); assert.equal(x.state().drawing, false);
    await x.send({ type: 'workflow', value: 'arrows' }); await x.send({ type: 'start', style: defaults });
    assert.equal(x.dots().length, 8);
    await x.choose(annotationPart(frame, 'annotation-note'));
    assert.equal(x.state().workflow, 'annotations'); assert.equal(x.dots().length, 0);
  } finally { x.figma.emit('close'); }
});
