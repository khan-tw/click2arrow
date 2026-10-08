// Click2Arrow runs on the current page only. Temporary anchors are owned by
// this session; source frames/components are never reparented or restyled.
const RELAUNCH = 'edit'
const EDGE_DATA = 'click2arrow.v1'
const ANNOTATION_DATA = 'click2arrow.annotation.v1'
type AnnotationOptions = { title: string; text: string; color: string; position: 'left' | 'right'; padding: number; noteWidth: number }
type RangeAnnotation = { version: 1; number: number; options: AnnotationOptions }
type Side = 'top' | 'right' | 'bottom' | 'left'
type Point = { x: number; y: number }
type Endpoint = { id: string; side: Side }
type Style = {
  route: 'elbow' | 'straight' | 'curve'; color: string; weight: number;
  arrows: 'end' | 'both' | 'none'; dashed: boolean;
  label: string; diagram: 'none' | 'process' | 'decision' | 'terminal'; diagramText: string
}
type Edge = { version: 1; source: Endpoint; target: Endpoint; style: Style }
type Message =
  | { type: 'ready'; channel?: string }
  | { type: 'stop' | 'cancel' | 'delete' | 'refresh' | 'annotation-new' | 'annotation-range-start' | 'annotation-range-cancel' }
  | { type: 'reverse' }
  | { type: 'compact'; value: boolean }
  | { type: 'start' | 'style' | 'apply'; style: Style }
  | { type: 'port'; side: Side }
  | { type: 'anchors'; mode: 'visible' | 'selection' }
  | { type: 'workflow'; value: 'arrows' | 'annotations' }
  | { type: 'annotation-create'; mode: 'draw' | 'selection' | 'rectangle'; options: AnnotationOptions }
  | { type: 'annotation-apply'; options: AnnotationOptions }
  | { type: 'annotation-delete' }
const defaults: Style = { route: 'elbow', color: '#2563eb', weight: 2, arrows: 'end', dashed: false, label: '', diagram: 'none', diagramText: '' }
const sides: Side[] = ['top', 'right', 'bottom', 'left']
let style = { ...defaults }
let anchorMode: 'visible' | 'selection' = 'selection'
let anchorLimit = false
let fontReady = false
let drawing = false
let source: Endpoint | null = null
let selectedTarget: SceneNode | null = null
let editing: FrameNode | null = null
let workflow: 'arrows' | 'annotations' = 'arrows'
let uiChannel = ''
let feedback = { message: '', error: false, sequence: 0 }
let editingAnnotation: FrameNode | null = null
let rangeCapture: { existing: Set<string>; node: RectangleNode | null } | null = null
let busy = false
let isClosed = false
let page = figma.currentPage
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
let syncTimer: ReturnType<typeof setTimeout> | undefined
let refreshing = false
type Handle = { node: FrameNode; area: RectangleNode; dot: EllipseNode; endpoint: Endpoint; target: SceneNode }
const handles = new Map<string, Handle>()
const endpointCache = new Map<string, SceneNode>()
const partStyles = new Map<string, string>()
const tracked = new Map<string, { node: FrameNode; fingerprint: string }>()
const paint = (hex: string): SolidPaint => ({ type: 'SOLID', color: { r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 } })
const finite = (x: unknown, fallback: number) => typeof x === 'number' && Number.isFinite(x) ? x : fallback
function validateStyle(value: Partial<Style> | undefined): Style {
  const s = value || {}
  return {
    route: s.route === 'straight' || s.route === 'curve' ? s.route : 'elbow',
    color: typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : defaults.color,
    weight: Math.max(1, Math.min(8, finite(s.weight, 2))),
    arrows: s.arrows === 'both' || s.arrows === 'none' ? s.arrows : 'end',
    dashed: s.dashed === true,
    label: typeof s.label === 'string' ? s.label.slice(0, 180) : '',
    diagram: s.diagram === 'process' || s.diagram === 'decision' || s.diagram === 'terminal' ? s.diagram : 'none',
    diagramText: typeof s.diagramText === 'string' ? s.diagramText.slice(0, 120) : ''
  }
}
function data(node: BaseNode): Edge | null {
  try {
    const e = JSON.parse(node.getPluginData(EDGE_DATA)) as Edge
    if (e.version !== 1 || !e.source?.id || !e.target?.id || !sides.includes(e.source.side) || !sides.includes(e.target.side)) return null
    e.style = validateStyle(e.style)
    return e
  } catch { return null }
}
function target(node: SceneNode | null): node is FrameNode | ComponentNode | InstanceNode | ComponentSetNode {
  return !!node && !node.removed && node.visible && !node.locked && !['edge', 'label', 'annotation', 'annotation-note', 'annotation-badge', 'handle', 'handle-dot'].includes(node.getPluginData('c2a-role')) && node.name !== 'Flow label' &&
    ['FRAME', 'COMPONENT', 'INSTANCE', 'COMPONENT_SET'].includes(node.type)
}
function transform(n: SceneNode, p: Point): Point {
  const t = n.absoluteTransform
  return { x: t[0][0] * p.x + t[0][1] * p.y + t[0][2], y: t[1][0] * p.x + t[1][1] * p.y + t[1][2] }
}
function anchor(n: SceneNode, side: Side): Point {
  return transform(n, side === 'top' ? { x: n.width / 2, y: 0 } : side === 'right' ? { x: n.width, y: n.height / 2 } : side === 'bottom' ? { x: n.width / 2, y: n.height } : { x: 0, y: n.height / 2 })
}
function normal(n: SceneNode, side: Side): Point {
  const t = n.absoluteTransform
  const p = side === 'top' ? { x: 0, y: -1 } : side === 'right' ? { x: 1, y: 0 } : side === 'bottom' ? { x: 0, y: 1 } : { x: -1, y: 0 }
  const x = t[0][0] * p.x + t[0][1] * p.y, y = t[1][0] * p.x + t[1][1] * p.y
  const d = Math.hypot(x, y) || 1
  return { x: x / d, y: y / d }
}
type Box = { x: number; y: number; width: number; height: number }
const inside = (p: Point, r: Box) => p.x > r.x + .01 && p.x < r.x + r.width - .01 && p.y > r.y + .01 && p.y < r.y + r.height - .01
function clearSegment(a: Point, b: Point, boxes: Box[]): boolean {
  return !boxes.some(r => a.x === b.x
    ? a.x > r.x && a.x < r.x + r.width && Math.max(a.y, b.y) > r.y && Math.min(a.y, b.y) < r.y + r.height
    : a.y > r.y && a.y < r.y + r.height && Math.max(a.x, b.x) > r.x && Math.min(a.x, b.x) < r.x + r.width)
}
// Bounded Manhattan routing around the two connected objects. Other objects
// are not obstacles in v1. Rotated objects use their absolute bounding boxes.
function elbow(a: Point, b: Point, na: Point, nb: Point, boxes: Box[]): Point[] {
  const pa = { x: a.x + na.x * 28, y: a.y + na.y * 28 }
  const pb = { x: b.x + nb.x * 28, y: b.y + nb.y * 28 }
  const obstacles = boxes.map(r => ({ x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }))
  const xs = Array.from(new Set([pa.x, pb.x, ...obstacles.reduce<number[]>((all, r) => all.concat([r.x - 20, r.x + r.width + 20]), [])])).sort((x, y) => x - y)
  const ys = Array.from(new Set([pa.y, pb.y, ...obstacles.reduce<number[]>((all, r) => all.concat([r.y - 20, r.y + r.height + 20]), [])])).sort((x, y) => x - y)
  const points = xs.reduce<Point[]>((all, x) => all.concat(ys.map(y => ({ x, y }))), []).filter(p => !obstacles.some(r => inside(p, r)))
  const start = points.findIndex(p => p.x === pa.x && p.y === pa.y), end = points.findIndex(p => p.x === pb.x && p.y === pb.y)
  if (start < 0 || end < 0) return [a, pa, { x: pb.x, y: pa.y }, pb, b]
  const dist = points.map(() => Infinity), prev = points.map(() => -1), seen = new Set<number>()
  dist[start] = 0
  for (let k = 0; k < points.length; k++) {
    let u = -1
    for (let i = 0; i < points.length; i++) if (!seen.has(i) && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || !Number.isFinite(dist[u])) break
    if (u === end) break
    seen.add(u)
    for (let v = 0; v < points.length; v++) {
      if (seen.has(v) || u === v) continue
      const p = points[u], q = points[v]
      if ((p.x !== q.x && p.y !== q.y) || !clearSegment(p, q, obstacles)) continue
      const cost = dist[u] + Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + 12
      if (cost < dist[v]) { dist[v] = cost; prev[v] = u }
    }
  }
  if (!Number.isFinite(dist[end])) return [a, pa, { x: pb.x, y: pa.y }, pb, b]
  const path: Point[] = []
  for (let at = end; at !== -1; at = prev[at]) path.unshift(points[at])
  return [a, ...path, b].filter((p, i, all) => !i || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) > .01)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function along(points: Point[], fraction: number): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let left = lengths.reduce((a, b) => a + b, 0) * fraction
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) { const t = lengths[i] ? left / lengths[i] : 0; return { x: lerp(points[i].x, points[i + 1].x, t), y: lerp(points[i].y, points[i + 1].y, t) } }
    left -= lengths[i]
  }
  return points[points.length - 1]
}
function move(n: SceneNode, x: number, y: number): void {
  if (Math.abs(n.x - x) > .001) n.x = x
  if (Math.abs(n.y - y) > .001) n.y = y
}
function size(n: FrameNode | EllipseNode | RectangleNode | TextNode, w: number, h: number): void {
  if (Math.abs(n.width - w) > .001 || Math.abs(n.height - h) > .001) n.resize(w, h)
}
function part<T extends SceneNode>(parent: FrameNode, key: string, name: string, create: () => T): T {
  let n = parent.children.find(c => c.getPluginData('c2a-part') === key) as T | undefined
  if (!n) n = parent.children.find(c => !c.getPluginData('c2a-part') && (c.name === name || key === 'text' && c.type === 'TEXT' || key === 'shape' && c.type === 'RECTANGLE')) as T | undefined
  if (!n) { n = create(); parent.appendChild(n); n.name = name }
  if (n.getPluginData('c2a-part') !== key) n.setPluginData('c2a-part', key)
  return n
}
function removePart(parent: FrameNode, key: string): void {
  const n = parent.children.find(c => c.getPluginData('c2a-part') === key)
  if (n) n.remove()
}
const annotationDefaults: AnnotationOptions = { title: '', text: '', color: '#d97706', position: 'right', padding: 16, noteWidth: 240 }
function annotationOptions(value: Partial<AnnotationOptions> | undefined): AnnotationOptions {
  const o = value || {}
  return {
    title: typeof o.title === 'string' ? o.title.slice(0, 80) : '',
    text: typeof o.text === 'string' ? o.text.slice(0, 2000) : '',
    color: typeof o.color === 'string' && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : annotationDefaults.color,
    position: o.position === 'left' ? 'left' : 'right',
    padding: Math.max(0, Math.min(100, finite(o.padding, 16))),
    noteWidth: Math.max(160, Math.min(480, finite(o.noteWidth, 240)))
  }
}
function annotationData(node: BaseNode): RangeAnnotation | null {
  try {
    const a = JSON.parse(node.getPluginData(ANNOTATION_DATA)) as RangeAnnotation
    if (a.version !== 1 || !Number.isInteger(a.number) || a.number < 1 || a.number > 9999) return null
    a.options = annotationOptions(a.options)
    return a
  } catch { return null }
}
function ownedAnnotation(node: SceneNode | null): FrameNode | null {
  let n: BaseNode | null = node
  while (n && n !== page) {
    if (n.type === 'FRAME' && annotationData(n)) return n
    n = n.parent
  }
  return null
}
function annotationPart(frame: FrameNode, key: string): SceneNode | undefined {
  return frame.children.find(n => n.getPluginData('c2a-part') === key)
}
function annotationSnapshot(frame: FrameNode): RangeAnnotation | null {
  const a = annotationData(frame)
  if (!a) return null
  const note = annotationPart(frame, 'annotation-note')
  if (note && note.type === 'FRAME') {
    const title = annotationPart(note, 'annotation-title'), text = annotationPart(note, 'annotation-text')
    // Native text edits remain authoritative when reopening the panel.
    if (title?.type === 'TEXT') a.options.title = title.characters.slice(0, 80)
    if (text?.type === 'TEXT') a.options.text = text.characters.slice(0, 2000)
  }
  return a
}
function nextAnnotationNumber(): number {
  let next = Math.max(1, Math.floor(finite(Number(page.getPluginData('c2a-annotation-next')), 1)))
  for (const node of page.children) {
    const a = annotationData(node)
    if (a) next = Math.max(next, a.number + 1)
  }
  return next
}
function annotationSelection(): SceneNode[] {
  return page.selection.filter(n => !n.removed && n.visible && !handleFor(n) && !['handle', 'range-draft'].includes(n.getPluginData('c2a-role')) && !ownedAnnotation(n))
}
function clearRangeCapture(): void {
  const node = rangeCapture?.node
  rangeCapture = null
  if (node && !node.removed && node.getPluginData('c2a-role') === 'range-draft') node.remove()
}
function captureRange(): void {
  if (!rangeCapture || rangeCapture.node || busy) return
  const selected = page.selection
  if (!convertibleRectangle(selected) || rangeCapture.existing.has(selected[0].id)) return
  try { annotationBounds(selected, 0) } catch { return }
  const node = selected[0]
  rangeCapture.node = node; rangeCapture.existing.clear()
  node.setPluginData('c2a-role', 'range-draft'); node.name = 'Click2Arrow range draft'
  node.fills = []; node.strokes = [paint(annotationDefaults.color)]; node.strokeWeight = 2; node.dashPattern = [8, 5]
  report('範圍已記住。填寫備註後按「建立註記」。')
}
function convertibleRectangle(nodes: readonly SceneNode[]): nodes is [RectangleNode] {
  if (nodes.length !== 1 || nodes[0].removed || !nodes[0].visible || nodes[0].type !== 'RECTANGLE' || nodes[0].locked || ownedAnnotation(nodes[0])) return false
  let parent = nodes[0].parent
  while (parent && parent !== page) {
    if (parent.type === 'INSTANCE' || parent.type === 'COMPONENT' || parent.type === 'COMPONENT_SET' ||
      'locked' in parent && parent.locked || 'layoutMode' in parent && parent.layoutMode !== 'NONE') return false
    parent = parent.parent
  }
  return parent === page
}
function annotationBounds(nodes: readonly SceneNode[], padding: number): Box {
  if (!nodes.length || nodes.length > 100) throw new Error('請框選 1 至 100 個物件，或用 R 畫出範圍矩形。')
  const boxes = nodes.map(n => n.absoluteBoundingBox)
  if (nodes.some(n => n.removed || !n.visible) || boxes.some(b => !b || ![b.x, b.y, b.width, b.height].every(Number.isFinite))) throw new Error('無法讀取範圍，請重新選取。')
  const valid = boxes as Rect[], x = Math.min(...valid.map(b => b.x)) - padding, y = Math.min(...valid.map(b => b.y)) - padding
  const width = Math.max(...valid.map(b => b.x + b.width)) - x + padding, height = Math.max(...valid.map(b => b.y + b.height)) - y + padding
  if (width < 1 || height < 1 || width > 50000 || height > 50000) throw new Error('範圍過小或過大，請調整框選範圍。')
  return { x, y, width, height }
}
function annotationText(parent: FrameNode, key: string, value: string, width: number, color: string, fontSize: number): TextNode {
  const text = part(parent, key, key, () => figma.createText())
  text.fontName = { family: 'Inter', style: 'Regular' }; text.fontSize = fontSize
  text.lineHeight = { value: 150, unit: 'PERCENT' }; text.textAlignHorizontal = 'LEFT'
  text.fills = [paint(color)]; text.textAutoResize = 'HEIGHT'
  text.resize(width, Math.max(1, text.height)); text.characters = value
  return text
}
function renderAnnotation(frame: FrameNode, a: RangeAnnotation, box: Box, axes?: Transform): void {
  const o = a.options, borderX = o.position === 'left' ? o.noteWidth + 24 : 0, borderY = 14
  // Keep the outlined area fixed when switching note sides, even after rotation.
  const t = axes || [[1, 0, 0], [0, 1, 0]]
  move(frame, box.x - t[0][0] * borderX - t[0][1] * borderY, box.y - t[1][0] * borderX - t[1][1] * borderY)
  frame.fills = []; frame.strokes = []; frame.clipsContent = false
  const border = part(frame, 'annotation-border', 'Annotation range', () => figma.createRectangle())
  size(border, box.width, box.height); move(border, borderX, borderY)
  border.fills = []; border.strokes = [paint(o.color)]; border.strokeWeight = 2; border.strokeAlign = 'OUTSIDE'; border.dashPattern = [8, 5]; border.cornerRadius = 6
  const number = String(a.number).padStart(2, '0')
  const badge = part(frame, 'annotation-badge', `Annotation ${number}`, () => figma.createFrame())
  badge.setPluginData('c2a-role', 'annotation-badge'); badge.fills = [paint(o.color)]; badge.cornerRadius = 14; badge.clipsContent = false
  const badgeWidth = Math.max(32, number.length * 9 + 14)
  size(badge, badgeWidth, 28); move(badge, borderX + 12, 0)
  const badgeText = annotationText(badge, 'annotation-number', number, badgeWidth - 8, '#ffffff', 13)
  badgeText.textAlignHorizontal = 'CENTER'; move(badgeText, 4, (28 - badgeText.height) / 2)
  const note = part(frame, 'annotation-note', 'Annotation note', () => figma.createFrame())
  note.setPluginData('c2a-role', 'annotation-note'); note.fills = [paint('#ffffff')]; note.strokes = [paint(o.color)]; note.strokeWeight = 1; note.cornerRadius = 8; note.clipsContent = false
  const heading = annotationText(note, 'annotation-heading', `#${number}`, o.noteWidth - 28, o.color, 12)
  move(heading, 14, 12)
  let textY = 12 + heading.height + 8
  if (o.title.trim()) {
    const title = annotationText(note, 'annotation-title', o.title, o.noteWidth - 28, '#0f172a', 14)
    move(title, 14, textY); textY += title.height + 6
  } else removePart(note, 'annotation-title')
  const body = annotationText(note, 'annotation-text', o.text, o.noteWidth - 28, '#334155', 13)
  move(body, 14, textY); size(note, o.noteWidth, textY + body.height + 14)
  move(note, o.position === 'left' ? 0 : borderX + box.width + 24, borderY)
  size(frame, box.width + 24 + o.noteWidth, Math.max(box.height, note.height) + borderY)
  frame.setPluginData('c2a-role', 'annotation'); frame.setPluginData(ANNOTATION_DATA, JSON.stringify(a))
  frame.name = `Annotation ${number}${o.title.trim() ? ': ' + o.title : ''}`
  frame.setRelaunchData({ [RELAUNCH]: 'Edit range annotation' })
}
async function createAnnotation(mode: 'draw' | 'selection' | 'rectangle', value: AnnotationOptions): Promise<void> {
  const captured = mode === 'draw' ? rangeCapture?.node : null
  const options = annotationOptions(value), selected = captured ? [captured] : [...page.selection], nodes = captured ? [captured] : annotationSelection(), currentPage = page, rev = revision
  if (mode === 'draw' && (!captured || !convertibleRectangle([captured]))) throw new Error('請先按「框選範圍」，再按 R 畫出新的範圍。')
  if (!options.text.trim()) throw new Error('請先輸入文字備註。')
  if (nodes.length !== selected.length) throw new Error('請選取要註記的原有物件，不包含既有註記或連線點。')
  if (mode === 'rectangle' && !convertibleRectangle(selected)) throw new Error('請選取一個可編輯的矩形；元件或自動排版內的矩形無法轉換。')
  if (currentPage.children.filter(n => !!annotationData(n)).length >= 200) throw new Error('此頁面已達 200 個註記。請分頁建立。')
  annotationBounds(nodes, mode === 'selection' ? options.padding : 0)
  busy = true; report('建立範圍註記中...')
  let frame: FrameNode | null = null
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    if (isClosed || page !== currentPage || rev !== revision) return
    if (mode !== 'selection' && !convertibleRectangle(selected)) throw new Error('矩形已變更，請重新框選。')
    if (mode === 'draw' && rangeCapture?.node !== captured) throw new Error('範圍已變更，請重新框選。')
    const box = annotationBounds(nodes, mode === 'selection' ? options.padding : 0), number = nextAnnotationNumber()
    if (number > 9999) throw new Error('此頁面的註記編號已用完，請新增頁面。')
    frame = figma.createFrame(); page.appendChild(frame)
    renderAnnotation(frame, { version: 1, number, options }, box)
    // Only an explicitly drawn range or explicit conversion consumes a rectangle.
    if (mode !== 'selection') selected[0].remove()
    if (mode === 'draw') rangeCapture = null
    page.setPluginData('c2a-annotation-next', String(number + 1))
    editingAnnotation = frame; page.selection = [frame]; figma.commitUndo()
    report(`註記 #${String(number).padStart(2, '0')} 已建立。可直接編輯文字，或移動整組註記。`)
  } catch (err) {
    if (frame && !frame.removed) frame.remove()
    throw err
  } finally { busy = false; report() }
}
async function applyAnnotation(value: AnnotationOptions): Promise<void> {
  const frame = editingAnnotation, a = frame && !frame.removed ? annotationSnapshot(frame) : null, rev = revision
  if (!frame || !a || frame.parent !== page || frame.locked || page.selection.length !== 1 || ownedAnnotation(page.selection[0]) !== frame) throw new Error('請先選取目前頁面可編輯的範圍註記。')
  const options = annotationOptions(value)
  if (!options.text.trim()) throw new Error('請先輸入文字備註。')
  busy = true; report('儲存註記中...')
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    if (isClosed || rev !== revision) return
    if (frame.removed || frame.parent !== page || frame.locked || page.selection.length !== 1 || ownedAnnotation(page.selection[0]) !== frame) throw new Error('選取已變更，請重新選取註記後儲存。')
    const border = annotationPart(frame, 'annotation-border')
    if (!border || border.type !== 'RECTANGLE') throw new Error('註記外框已刪除，請重新建立註記。')
    const origin = transform(border, { x: 0, y: 0 })
    renderAnnotation(frame, { ...a, options }, { ...origin, width: border.width, height: border.height }, frame.absoluteTransform)
    figma.commitUndo(); report('註記已儲存。編號與原有範圍保持不變。')
  } finally { busy = false; if (page.selection.length !== 1 || ownedAnnotation(page.selection[0]) !== frame) selectionChanged(); report() }
}
function vector(parent: FrameNode, key: string, name: string, points: Point[], color: string, weight: number, filled = false, path?: string): VectorNode {
  const v = part(parent, key, name, () => figma.createVector())
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y))
  const d = path || points.map((p, i) => `${i ? 'L' : 'M'} ${p.x - minX} ${p.y - minY}`).join(' ') + (filled ? ' Z' : '')
  if (v.vectorPaths[0]?.data !== d) v.vectorPaths = [{ windingRule: 'NONZERO', data: d }]
  move(v, minX, minY)
  const signature = `${color}/${weight}/${filled}`
  if (partStyles.get(v.id) !== signature) {
    v.fills = filled ? [paint(color)] : []; v.strokes = filled ? [] : [paint(color)]
    v.strokeWeight = weight; v.strokeJoin = 'ROUND'; partStyles.set(v.id, signature)
  }
  return v
}
function tip(parent: FrameNode, key: string, point: Point, from: Point, s: Style): void {
  const angle = Math.atan2(point.y - from.y, point.x - from.x), d = 7 + s.weight * 1.2
  const ux = Math.cos(angle), uy = Math.sin(angle)
  vector(parent, key, 'Arrowhead', [point, { x: point.x - ux * d - uy * d * .48, y: point.y - uy * d + ux * d * .48 }, { x: point.x - ux * d + uy * d * .48, y: point.y - uy * d - ux * d * .48 }], s.color, 0, true)
}
function centeredText(parent: FrameNode, value: string, width: number): TextNode {
  const n = part(parent, 'text', 'Flow text', () => {
    const t = figma.createText(); t.fontName = { family: 'Inter', style: 'Regular' }; t.fontSize = 13
    t.fills = [paint('#1e293b')]; t.textAlignHorizontal = 'CENTER'; t.textAutoResize = 'HEIGHT'; return t
  })
  if (n.characters !== value) n.characters = value
  if (Math.abs(n.width - width) > .001) n.resize(width, Math.max(16, n.height))
  return n
}
async function resolve(e: Endpoint): Promise<SceneNode> {
  let n = endpointCache.get(e.id)
  if (!n || n.removed) {
    const found = await figma.getNodeByIdAsync(e.id)
    n = found && 'absoluteTransform' in found ? found : undefined
    if (n) endpointCache.set(e.id, n)
  }
  if (!n || !('absoluteTransform' in n) || n.removed || !n.visible) throw new Error('連線物件已刪除或隱藏。請重新選取。')
  let root: BaseNode | null = n
  while (root && root.type !== 'PAGE') {
    if ('visible' in root && !root.visible) throw new Error('連線物件已刪除或隱藏。請重新選取。')
    root = root.parent
  }
  if (root !== page) throw new Error('請選取同一個頁面的物件。')
  return n as SceneNode
}
function fingerprint(a: SceneNode, b: SceneNode, e: Edge): string {
  return JSON.stringify([a.absoluteTransform, a.width, a.height, b.absoluteTransform, b.width, b.height, e])
}
async function render(frame: FrameNode, e: Edge, endpoints?: [SceneNode, SceneNode]): Promise<void> {
  const [a, b] = endpoints || await Promise.all([resolve(e.source), resolve(e.target)])
  if (isClosed || frame.removed || frame.parent !== page) return
  const start = anchor(a, e.source.side), end = anchor(b, e.target.side), na = normal(a, e.source.side), nb = normal(b, e.target.side)
  const s = e.style
  let points = s.route === 'elbow' ? elbow(start, end, na, nb, [a.absoluteBoundingBox, b.absoluteBoundingBox].filter((x): x is Rect => !!x)) : [start, end]
  let controls: Point[] | null = null
  if (s.route === 'curve') {
    const d = Math.max(48, Math.min(240, Math.hypot(end.x - start.x, end.y - start.y) * .45))
    controls = [start, { x: start.x + na.x * d, y: start.y + na.y * d }, { x: end.x + nb.x * d, y: end.y + nb.y * d }, end]
    const c = controls
    points = Array.from({ length: 33 }, (_, i) => { const t = i / 32, u = 1 - t; return { x: u ** 3 * c[0].x + 3 * u ** 2 * t * c[1].x + 3 * u * t ** 2 * c[2].x + t ** 3 * c[3].x, y: u ** 3 * c[0].y + 3 * u ** 2 * t * c[1].y + 3 * u * t ** 2 * c[2].y + t ** 3 * c[3].y } })
  }
  const mid = along(points, .5), origin = { x: Math.min(...points.map(p => p.x), mid.x - 110) - 16, y: Math.min(...points.map(p => p.y), mid.y - 90) - 16 }
  const local = (p: Point) => ({ x: p.x - origin.x, y: p.y - origin.y })
  let diagram = frame.children.find(n => n.type === 'FRAME' && n.getPluginData('c2a-role') === 'diagram') as FrameNode | undefined
  move(frame, origin.x, origin.y)
  size(frame, Math.max(1, Math.max(...points.map(p => p.x), mid.x + 110) - origin.x + 16), Math.max(1, Math.max(...points.map(p => p.y), mid.y + 90) - origin.y + 16))
  const pts = points.map(local)
  let line: VectorNode
  if (controls) {
    const c = controls.map(local), minX = Math.min(...c.map(p => p.x)), minY = Math.min(...c.map(p => p.y)), q = c.map(p => ({ x: p.x - minX, y: p.y - minY }))
    line = vector(frame, 'line', 'Flow arrow', c, s.color, s.weight, false, `M ${q[0].x} ${q[0].y} C ${q[1].x} ${q[1].y} ${q[2].x} ${q[2].y} ${q[3].x} ${q[3].y}`)
  } else line = vector(frame, 'line', 'Flow arrow', pts, s.color, s.weight)
  if (!!line.dashPattern.length !== s.dashed) line.dashPattern = s.dashed ? [7, 5] : []
  if (s.arrows !== 'none') tip(frame, 'end', pts[pts.length - 1], controls ? local(controls[2]) : pts[pts.length - 2], s)
  if (s.arrows === 'both') tip(frame, 'start', pts[0], controls ? local(controls[1]) : pts[1], s)
  if (s.arrows === 'none') removePart(frame, 'end')
  if (s.arrows !== 'both') removePart(frame, 'start')
  // Adopt old arrowheads before removing any unused v0.1 parts.
  for (const n of [...frame.children]) if (n.name === 'Arrowhead' && !n.getPluginData('c2a-part')) n.remove()
  const m = local(mid)
  if (s.diagram !== 'none') {
    if (!diagram) { diagram = figma.createFrame(); frame.appendChild(diagram); diagram.setPluginData('c2a-role', 'diagram') }
    // Only replace the shape when its type changes; preserve text and frame IDs.
    diagram.name = `${s.diagram === 'decision' ? 'Decision' : s.diagram === 'terminal' ? 'Start / End' : 'Process'}: ${s.diagramText || 'Flow step'}`
    const w = s.diagram === 'decision' ? 152 : 144, h = s.diagram === 'decision' ? 92 : 64
    size(diagram, w, h); move(diagram, m.x - w / 2, m.y - h / 2)
    diagram.clipsContent = false; diagram.fills = []; diagram.strokes = []
    if (s.diagram === 'decision') {
      for (const n of [...diagram.children]) if (n.type === 'RECTANGLE') n.remove()
      const d = vector(diagram, 'shape', 'Decision shape', [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }], s.color, s.weight, false, `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`)
      if (d.fills === figma.mixed || !d.fills.length) d.fills = [paint('#ffffff')]
    } else {
      for (const n of [...diagram.children]) if (n.type === 'VECTOR') n.remove()
      const rect = part(diagram, 'shape', 'Flow shape', () => figma.createRectangle()); size(rect, w, h)
      rect.fills = [paint('#ffffff')]; rect.strokes = [paint(s.color)]; rect.strokeWeight = s.weight; rect.cornerRadius = s.diagram === 'terminal' ? h / 2 : 8
    }
    const t = centeredText(diagram, s.diagramText || (s.diagram === 'decision' ? 'Decision?' : s.diagram === 'terminal' ? 'Start / End' : 'Process'), s.diagram === 'decision' ? 94 : 116)
    move(t, (w - t.width) / 2, (h - t.height) / 2)
  } else if (diagram) { diagram.remove(); diagram = undefined }
  const oldLabel = frame.children.find(n => n.name === 'Flow label' && !n.getPluginData('c2a-part'))
  if (oldLabel) oldLabel.setPluginData('c2a-part', 'label')
  if (s.label.trim()) {
    const label = part(frame, 'label', 'Flow label', () => figma.createFrame()); label.setPluginData('c2a-role', 'label')
    const t = centeredText(label, s.label, Math.min(220, Math.max(72, s.label.length * 8)))
    size(label, t.width + 16, t.height + 10); label.fills = [paint('#ffffff')]; label.cornerRadius = 5; label.clipsContent = false
    t.x = 8; t.y = 5; label.x = m.x - label.width / 2
    label.y = s.diagram === 'none' ? m.y - label.height / 2 : m.y - (s.diagram === 'decision' ? 46 : 32) - label.height - 8
  } else removePart(frame, 'label')
  const saved = JSON.stringify(e)
  if (frame.getPluginData(EDGE_DATA) !== saved) frame.setPluginData(EDGE_DATA, saved)
  const name = `Flow: ${a.name} -> ${b.name}`
  if (frame.name !== name) frame.name = name
  if (!frame.getRelaunchData()[RELAUNCH]) frame.setRelaunchData({ [RELAUNCH]: 'Edit arrow and flow labels' })
  tracked.set(frame.id, { node: frame, fingerprint: fingerprint(a, b, e) })
}
function clearHandles(): void {
  for (const h of handles.values()) { if (!h.node.removed) h.node.remove(); partStyles.delete(h.node.id) }
  handles.clear()
}
// Figma skips empty frame interiors during canvas selection. A real shape
// catches nearby clicks; the small dot stays legible at every canvas zoom.
const HANDLE_HIT_SIZE = 40
const HANDLE_DOT_SIZE = 14
function handleFor(node: SceneNode): Handle | undefined {
  let current: BaseNode | null = node
  while (current && current !== page) {
    const handle = handles.get(current.id)
    if (handle) return handle
    current = current.parent
  }
  return undefined
}
function positionHandles(): void {
  const zoom = Math.max(.01, Math.min(256, finite(figma.viewport.zoom, 1)))
  const hitSize = HANDLE_HIT_SIZE / zoom, dotSize = HANDLE_DOT_SIZE / zoom
  for (const [id, h] of handles) {
    const n = h.target
    if (n.removed || !n.visible || h.node.removed || h.area.removed || h.dot.removed) { if (!h.node.removed) h.node.remove(); partStyles.delete(id); handles.delete(id); continue }
    const p = anchor(n, h.endpoint.side)
    size(h.node, hitSize, hitSize); move(h.node, p.x - hitSize / 2, p.y - hitSize / 2)
    size(h.area, hitSize, hitSize); move(h.area, 0, 0)
    size(h.dot, dotSize, dotSize); move(h.dot, (hitSize - dotSize) / 2, (hitSize - dotSize) / 2)
    const weight = 2 / zoom
    if (h.dot.strokeWeight !== weight) h.dot.strokeWeight = weight
    const selected = source?.id === n.id && source.side === h.endpoint.side
    const key = selected ? 'selected' : 'idle'
    if (partStyles.get(h.node.id) !== key) { h.dot.fills = [paint(selected ? '#2563eb' : '#ffffff')]; partStyles.set(h.node.id, key) }
  }
}
function syncHandles(nodes: SceneNode[]): void {
  const wanted = new Set(nodes.map(n => n.id)), existing = new Set<string>()
  for (const [id, h] of handles) {
    if (!wanted.has(h.endpoint.id) || h.node.removed || h.area.removed || h.dot.removed) { if (!h.node.removed) h.node.remove(); partStyles.delete(id); handles.delete(id) }
    else existing.add(`${h.endpoint.id}/${h.endpoint.side}`)
  }
  for (const targetNode of nodes) {
    endpointCache.set(targetNode.id, targetNode)
    for (const side of sides) {
      if (existing.has(`${targetNode.id}/${side}`)) continue
      const hit = figma.createFrame(); page.appendChild(hit)
      hit.name = `Click2Arrow anchor: ${side}`
      hit.fills = []; hit.strokes = []; hit.clipsContent = false
      hit.setPluginData('c2a-role', 'handle')
      const area = figma.createRectangle(); hit.appendChild(area)
      area.name = 'Connection hit area'; area.fills = [{ ...paint('#ffffff'), opacity: .001 }]; area.strokes = []
      area.setPluginData('c2a-role', 'handle-area')
      const dot = figma.createEllipse(); hit.appendChild(dot)
      dot.name = 'Connection point'; dot.fills = [paint('#ffffff')]; dot.strokes = [paint('#2563eb')]
      dot.setPluginData('c2a-role', 'handle-dot')
      handles.set(hit.id, { node: hit, area, dot, endpoint: { id: targetNode.id, side }, target: targetNode })
    }
  }
  positionHandles()
}
function visibleTargets(): SceneNode[] {
  const viewport = figma.viewport.bounds, result: SceneNode[] = []
  const visible = (n: SceneNode) => {
    const b = n.absoluteBoundingBox
    return !viewport || !!b && b.x + b.width >= viewport.x && b.y + b.height >= viewport.y && b.x <= viewport.x + viewport.width && b.y <= viewport.y + viewport.height
  }
  // Sections/groups are traversed; frames/components are atomic. Nested items
  // can always be selected explicitly, avoiding hundreds of internal ports.
  const stack: SceneNode[] = [...page.children].reverse()
  let examined = 0
  anchorLimit = false
  if (target(selectedTarget) && visible(selectedTarget)) result.push(selectedTarget)
  while (stack.length && examined++ < 1200 && result.length < 40) {
    const n = stack.pop()!
    if (n.removed || !n.visible || n.locked || n.getPluginData('c2a-role') === 'handle') continue
    if (target(n)) { if (visible(n) && !result.includes(n)) result.push(n); continue }
    if ('children' in n && (n.type === 'SECTION' || n.type === 'GROUP' || n.getPluginData('c2a-role') === 'edge')) stack.push(...[...n.children].reverse())
  }
  anchorLimit = stack.length > 0
  return result
}
function updateHandles(): void {
  if (isClosed) return
  if (!drawing) { clearHandles(); return }
  const count = handles.size
  syncHandles(anchorMode === 'visible' ? visibleTargets() : target(selectedTarget) ? [selectedTarget] : [])
  if (handles.size !== count) report()
}
function showHandles(node: SceneNode): void { selectedTarget = node; updateHandles() }
function report(message?: string, error = false): void {
  if (isClosed) return
  if (message !== undefined) feedback = { message, error, sequence: feedback.sequence + 1 }
  const annotation = editingAnnotation && !editingAnnotation.removed ? annotationSnapshot(editingAnnotation) : null
  const selected = annotationSelection()
  const captured = rangeCapture?.node
  const rangeReady = !!captured && convertibleRectangle([captured])
  let range: Box | null = null
  try { if (rangeReady) range = annotationBounds([captured!], 0); else if (selected.length && selected.length <= 100) range = annotationBounds(selected, 0) } catch { /* Invalid ranges remain unavailable. */ }
  const sourceNode = source ? endpointCache.get(source.id) : null
  figma.ui.postMessage({ type: 'state', channel: uiChannel, pageId: page.id, sourceName: sourceNode && !sourceNode.removed ? sourceNode.name : null, range, drawing, busy, source, anchorMode, anchorLimit, anchorCount: handles.size / 4, connectionCount: tracked.size, target: selectedTarget && !selectedTarget.removed ? { id: selectedTarget.id, name: selectedTarget.name } : null,
    editing: editing && !editing.removed ? { id: editing.id, name: editing.name } : null, style, workflow,
    annotation: annotation && editingAnnotation ? { id: editingAnnotation.id, name: editingAnnotation.name, ...annotation, editable: editingAnnotation.parent === page && !editingAnnotation.locked } : null,
    annotationSelectionCount: selected.length, annotationCanCreate: selected.length > 0 && selected.length <= 100 && selected.length === page.selection.length,
    rangeCapture: rangeReady ? 'ready' : rangeCapture ? (captured ? 'invalid' : 'drawing') : 'idle',
    annotationCanConvert: convertibleRectangle(page.selection) && !captured, annotationNext: nextAnnotationNumber(), ...feedback })
}
async function pick(endpoint: Endpoint): Promise<void> {
  if (!drawing || busy) return
  if (!source) {
    source = endpoint; positionHandles(); figma.currentPage.selection = []
    report(anchorMode === 'visible' ? '起點已設定。直接點另一個物件的連線點。' : '起點已設定。選取另一個物件，再點終點。'); return
  }
  if (source.id === endpoint.id) { report('請選取另一個物件作為終點。', true); return }
  const captured = source, currentPage = page
  busy = true; if (anchorMode === 'selection') clearHandles(); report('建立連線中...')
  let frame: FrameNode | null = null
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
    if (isClosed || page !== currentPage) return
    const endpoints = await Promise.all([resolve(captured), resolve(endpoint)]) as [SceneNode, SceneNode]
    if (isClosed || page !== currentPage) return
    if (tracked.size >= 200) throw new Error('此頁面已達 200 條連線。請分頁繪製。')
    frame = figma.createFrame(); page.appendChild(frame); frame.fills = []; frame.clipsContent = false; frame.setPluginData('c2a-role', 'edge')
    await render(frame, { version: 1, source: captured, target: endpoint, style: { ...style } }, endpoints)
    // Keep the native click targets above the new output without recreating them.
    for (const h of handles.values()) if (!h.node.removed) page.appendChild(h.node)
    figma.commitUndo(); source = null; selectedTarget = null; editing = frame
    figma.currentPage.selection = []
    report('箭頭已建立。可繼續連線，或調整這條箭頭。')
  } catch (err) {
    if (frame && !frame.removed) frame.remove()
    report(err instanceof Error ? err.message : '無法建立連線。', true)
  } finally { busy = false; updateHandles(); report() }
}
function ownedEdge(node: SceneNode | null): FrameNode | null {
  let n: BaseNode | null = node
  while (n && n !== page) {
    if (n.type === 'FRAME' && data(n)) return n
    n = n.parent
  }
  return null
}
function selectionChanged(allowAutoSwitch = true): void {
  if (busy || isClosed) return
  const selection = page.selection
  const annotation = selection.length === 1 ? ownedAnnotation(selection[0]) : null
  if (annotation && rangeCapture) clearRangeCapture()
  if (annotation && allowAutoSwitch) {
    workflow = 'annotations'; drawing = false; source = null; selectedTarget = null; editing = null; clearHandles()
  }
  if (workflow === 'annotations') {
    editingAnnotation = annotation; editing = null; selectedTarget = null
    captureRange()
    report(annotation ? '已選取範圍註記。可修改備註，或直接調整外框。' : rangeCapture?.node ? '範圍已記住。填寫備註後按「建立註記」。' : '按「框選範圍」，再到畫布按 R 拖出範圍。')
    return
  }
  editingAnnotation = null
  if (selection.length !== 1) {
    editing = null; selectedTarget = null; updateHandles()
    report(selection.length > 1 ? '請一次選取一個 frame 或 component。' : undefined); return
  }
  const node = selection[0], handle = handleFor(node)
  if (handle) { void pick(handle.endpoint); return }
  if (drawing && target(node)) { editing = null; showHandles(node); report(source ? '點四邊連線點之一，完成箭頭。' : '點四邊連線點之一，設定起點。'); return }
  selectedTarget = null; updateHandles()
  const edge = ownedEdge(node)
  editing = edge
  if (edge) { style = data(edge)!.style; report('已選取箭頭。調整後按「儲存變更」。') }
  else report(drawing ? '請選取 frame、component 或 instance。' : '按「開始連線」，再選取畫面上的物件。')
}
async function refreshGeometry(): Promise<boolean> {
  if (refreshing || isClosed || busy || !fontReady) return false
  let hasStaleEndpoint = false
  refreshing = true
  try {
    updateHandles()
    for (const [id, record] of [...tracked]) {
      if (isClosed) break
      if (record.node.removed) { tracked.delete(id); continue }
      const e = data(record.node)
      if (!e) { tracked.delete(id); continue }
      try {
        const [a, b] = await Promise.all([resolve(e.source), resolve(e.target)])
        const next = fingerprint(a, b, e)
        if (next !== record.fingerprint) await render(record.node, e, [a, b])
      } catch {
        // Preserve the user's arrow when an endpoint is missing; never delete
        // a potentially useful annotation as a side effect of synchronization.
        hasStaleEndpoint = true
        // Keep tracking so undo/unhide can restore synchronization automatically.
      }
    }
  } finally { refreshing = false }
  return hasStaleEndpoint
}
function changed(): void {
  if (timer !== undefined) return
  timer = setTimeout(() => { timer = undefined; if (workflow === 'annotations') { captureRange(); report() } void refreshGeometry().catch(() => report('無法更新箭頭，請重新開啟 plugin。', true)) }, 32)
}
// Editor property changes can arrive without a usable page notification.
// Check the bounded set of saved endpoints while the plugin is open. The
// fingerprint prevents writes when nothing moved; the timer ends on close.
function watchGeometry(): void {
  syncTimer = setTimeout(async () => {
    if (isClosed) return
    try {
      if (tracked.size || drawing) await refreshGeometry()
    } catch { report('無法更新箭頭，請重新開啟 plugin。', true) }
    if (!isClosed) watchGeometry()
  }, 160)
}
function scan(): void {
  tracked.clear()
  for (const n of [...page.children]) {
    if (n.getPluginData('c2a-role') === 'handle' && !handles.has(n.id)) { n.remove(); continue }
    if (tracked.size >= 200) break
    if (n.type === 'FRAME' && data(n)) tracked.set(n.id, { node: n, fingerprint: '' })
  }
}
figma.showUI(__html__, { width: 380, height: 680, themeColors: true })
figma.root.setRelaunchData({ ...figma.root.getRelaunchData(), [RELAUNCH]: 'Draw flow arrows and range annotations' })
scan()
page.on('nodechange', changed)
watchGeometry()
figma.on('selectionchange', selectionChanged)
figma.on('currentpagechange', () => {
  revision++; clearHandles(); clearRangeCapture(); source = null; selectedTarget = null; editing = null; editingAnnotation = null
  endpointCache.clear(); partStyles.clear(); page.off('nodechange', changed); page = figma.currentPage; scan(); page.on('nodechange', changed); selectionChanged(); changed()
})
figma.on('close', () => {
  isClosed = true; revision++
  if (timer !== undefined) clearTimeout(timer)
  if (syncTimer !== undefined) clearTimeout(syncTimer)
  clearHandles(); clearRangeCapture(); page.off('nodechange', changed)
})
figma.ui.onmessage = async (m: Message & { requestId?: string }) => {
  if (!m || isClosed) return
  const startRevision = revision, startFeedback = feedback.sequence
  let succeeded = true
  try {
    if (m.type === 'ready') {
      if (typeof m.channel === 'string' && /^[a-f0-9]{32}$/.test(m.channel)) uiChannel = m.channel
      try { const saved = JSON.parse(figma.root.getPluginData('c2a-preferences') || '{}'); style = validateStyle({ ...defaults, ...saved, label: '', diagramText: '' }) } catch { style = { ...defaults } }
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); fontReady = true; selectionChanged(); changed(); return
    }
    if (busy && m.type !== 'style') { succeeded = false; report('請等待目前操作完成。'); return }
    if (m.type === 'workflow') {
      if (m.value === workflow) { report(); return }
      clearRangeCapture()
      workflow = m.value === 'annotations' ? 'annotations' : 'arrows'
      if (workflow === 'annotations') { drawing = false; source = null; selectedTarget = null; clearHandles(); editing = null }
      editingAnnotation = null; selectionChanged(false); report(); return
    }
    if (m.type === 'annotation-new') {
      clearRangeCapture()
      workflow = 'annotations'; drawing = false; source = null; selectedTarget = null; editing = null; editingAnnotation = null; clearHandles(); page.selection = []; report('請選取新的範圍，再填寫備註。'); return
    }
    if (m.type === 'annotation-range-start') {
      if (workflow !== 'annotations') throw new Error('請先切換至範圍註記。')
      clearRangeCapture(); editingAnnotation = null
      rangeCapture = { existing: new Set(page.findAllWithCriteria({ types: ['RECTANGLE'] }).map(n => n.id)), node: null }
      page.selection = []; report('點一下畫布，按 R，再拖出要註記的範圍。'); return
    }
    if (m.type === 'annotation-range-cancel') { clearRangeCapture(); report('已取消框選。可重新框選範圍。'); return }
    if (m.type === 'annotation-create') {
      if (workflow !== 'annotations' || !['draw', 'rectangle', 'selection'].includes(m.mode)) throw new Error('請先切換至範圍註記。')
      await createAnnotation(m.mode, m.options); return
    }
    if (m.type === 'annotation-apply') { if (workflow !== 'annotations') throw new Error('請先切換至範圍註記。'); await applyAnnotation(m.options); return }
    if (m.type === 'annotation-delete') {
      const frame = editingAnnotation
      if (workflow !== 'annotations' || !frame || frame.removed || frame.parent !== page || frame.locked || !annotationData(frame) || page.selection.length !== 1 || ownedAnnotation(page.selection[0]) !== frame) throw new Error('請先選取可編輯的範圍註記。')
      frame.remove(); editingAnnotation = null; page.selection = []; figma.commitUndo(); report('已刪除選取的範圍註記。'); return
    }
    if (m.type === 'compact') { figma.ui.resize(380, m.value ? 360 : 680); return }
    if (m.type === 'anchors') {
      anchorMode = m.mode === 'selection' ? 'selection' : 'visible'; updateHandles(); report('連線點顯示方式已切換。'); return
    }
    if (m.type === 'start' || m.type === 'style') {
      style = validateStyle(m.style)
      const { label: _label, diagramText: _text, ...preferences } = style
      figma.root.setPluginData('c2a-preferences', JSON.stringify(preferences))
      if (m.type === 'start') { workflow = 'arrows'; editingAnnotation = null; drawing = true; source = null; editing = null; selectionChanged(false); updateHandles(); report(anchorMode === 'visible' ? '直接點起點，再點終點。每次顯示最多 40 個可見物件。' : '選取 frame 或 component，顯示四邊連線點。') }
      return
    }
    if (m.type === 'stop' || m.type === 'cancel') {
      source = null; if (anchorMode === 'selection') clearHandles(); selectedTarget = null
      if (m.type === 'stop') drawing = false
      updateHandles()
      report(m.type === 'stop' ? '已停止繪製。選取箭頭可修改內容。' : '已取消起點。可重新選取物件。'); return
    }
    if (m.type === 'port' && sides.includes(m.side) && selectedTarget && target(selectedTarget)) { await pick({ id: selectedTarget.id, side: m.side }); return }
    if (m.type === 'apply' || m.type === 'reverse') {
      const frame = editing, e = frame && !frame.removed ? data(frame) : null
      if (!frame || !e || frame.locked || frame.parent !== page || page.selection.length !== 1 || ownedEdge(page.selection[0]) !== frame) throw new Error('請先選取目前頁面可編輯的 Click2Arrow 箭頭。')
      busy = true; report('更新中...'); const rev = revision
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
        if (isClosed || rev !== revision) return
        if (page.selection.length !== 1 || ownedEdge(page.selection[0]) !== frame || frame.removed || frame.locked || frame.parent !== page) throw new Error('選取已變更，請重新選取箭頭後儲存。')
        const next = m.type === 'reverse' ? { ...e, source: e.target, target: e.source } : { ...e, style: validateStyle(m.style) }
        const endpoints = await Promise.all([resolve(next.source), resolve(next.target)]) as [SceneNode, SceneNode]
        if (isClosed || rev !== revision) return
        if (page.selection.length !== 1 || ownedEdge(page.selection[0]) !== frame || frame.removed || frame.locked || frame.parent !== page) throw new Error('選取已變更，請重新選取箭頭後儲存。')
        await render(frame, next, endpoints); style = next.style; figma.commitUndo(); report(m.type === 'reverse' ? '已交換起點與終點。' : '箭頭、圖形與文字已更新。')
      } finally { busy = false; if (page.selection.length !== 1 || ownedEdge(page.selection[0]) !== frame) selectionChanged(); report() }
      return
    }
    if (m.type === 'delete') {
      if (!editing || editing.removed || editing.locked || editing.parent !== page || !data(editing) || page.selection.length !== 1 || ownedEdge(page.selection[0]) !== editing) throw new Error('請先選取要刪除的 Click2Arrow 箭頭。')
      tracked.delete(editing.id); editing.remove(); editing = null; figma.commitUndo(); report('已刪除選取的箭頭。'); return
    }
    if (m.type === 'refresh') {
      scan(); const hasStaleEndpoint = await refreshGeometry()
      report(hasStaleEndpoint ? '部分連線物件已刪除或隱藏；其箭頭已保留。' : '連線位置已更新。', hasStaleEndpoint)
    }
  } catch (err) { succeeded = false; busy = false; report(err instanceof Error ? err.message : '操作未完成，請再試一次。', true) }
  finally {
    if (!isClosed && typeof m.requestId === 'string' && m.requestId.length <= 64) figma.ui.postMessage({ type: 'result', channel: uiChannel, requestId: m.requestId, ok: succeeded && startRevision === revision && !(feedback.sequence > startFeedback && feedback.error) })
  }
}
