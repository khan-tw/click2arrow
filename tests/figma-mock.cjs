// A scene-graph test double. It deliberately implements only the documented
// API surface used by this plugin; it cannot prove editor-specific behavior.
(function (root) {
  function createFigma() {
    let count = 0;
    const nodes = new Map(), listeners = new Map();
    const schedule = typeof queueMicrotask === 'function' ? queueMicrotask : cb => Promise.resolve().then(cb);
    class Node {
      constructor(type) {
        this.id = String(++count); this.type = type; this.name = type;
        this.x = 0; this.y = 0; this.width = 100; this.height = 100;
        this.vectorPaths = []; this.dashPattern = []; this.children = []; this.parent = null; this.removed = false;
        this.visible = true; this.locked = false; this.rotation = 0;
        this.fills = []; this.strokes = []; this.strokeWeight = 1;
        this.clipsContent = false; this.cornerRadius = 0; this.characters = '';
        this.pluginData = {}; this.relaunchData = {}; this.events = new Map();
        nodes.set(this.id, this);
      }
      appendChild(node) {
        if (node.parent) node.parent.children = node.parent.children.filter(n => n !== node);
        this.children.push(node); node.parent = this;
      }
      findAllWithCriteria({types}) {
        const found=[], visit=n=>{for(const child of n.children){if(types.includes(child.type))found.push(child);visit(child);}};visit(this);return found;
      }
      remove() {
        if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this);
        this.removed = true; for (const n of [...this.children]) n.remove();
      }
      resize(w, h) { if (!(w > 0 && h > 0)) throw new Error('Invalid resize'); this.width = w; this.height = h; }
      setPluginData(k, v) { this.pluginData[k] = v; }
      getPluginData(k) { return this.pluginData[k] || ''; }
      setRelaunchData(v) { this.relaunchData = v; }
      getRelaunchData() { return this.relaunchData; }
      on(type, fn) { this.events.set(type, fn); }
      off(type, fn) { if (this.events.get(type) === fn) this.events.delete(type); }
      get absoluteTransform() {
        const angle = this.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const p = this.parent && this.parent.type !== 'PAGE' && this.parent.type !== 'DOCUMENT' ? this.parent.absoluteTransform : [[1, 0, 0], [0, 1, 0]];
        return [[p[0][0] * c + p[0][1] * s, -p[0][0] * s + p[0][1] * c, p[0][0] * this.x + p[0][1] * this.y + p[0][2]], [p[1][0] * c + p[1][1] * s, -p[1][0] * s + p[1][1] * c, p[1][0] * this.x + p[1][1] * this.y + p[1][2]]];
      }
      get absoluteBoundingBox() {
        const t = this.absoluteTransform;
        const corners = [[0, 0], [this.width, 0], [0, this.height], [this.width, this.height]].map(([x, y]) => ({ x: t[0][0] * x + t[0][1] * y + t[0][2], y: t[1][0] * x + t[1][1] * y + t[1][2] }));
        const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y));
        return { x, y, width: Math.max(...corners.map(p => p.x)) - x, height: Math.max(...corners.map(p => p.y)) - y };
      }
      get selection() { return this._selection || []; }
      set selection(value) { this._selection = value; schedule(() => { for (const fn of listeners.get('selectionchange') || []) fn(); }); }
    }
    const document = new Node('DOCUMENT'), initialPage = new Node('PAGE'); document.appendChild(initialPage);
    const figma = {
      root: document, currentPage: initialPage, viewport: { zoom: 1, center: { x: 500, y: 300 } },
      ui: { postMessage() {}, resize() {}, onmessage: null }, undoCount: 0,
      showUI() {}, loadFontAsync: async () => {},
      getNodeByIdAsync: async id => { const n = nodes.get(id); return n && !n.removed ? n : null; },
      commitUndo() { this.undoCount++; },
      on(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
      emit(type) { for (const fn of listeners.get(type) || []) fn(); },
      nodeChange() { const fn = this.currentPage.events.get('nodechange'); if (fn) fn({ nodeChanges: [] }); },
      changePage(p) { this.currentPage = p; this.emit('currentpagechange'); },
      nodes, Node
    };
    for (const [method, type] of [['createFrame', 'FRAME'], ['createEllipse', 'ELLIPSE'], ['createRectangle', 'RECTANGLE'], ['createText', 'TEXT'], ['createVector', 'VECTOR']]) {
      figma[method] = () => { const n = new Node(type); if (type === 'TEXT') { n.width = 100; n.height = 18; } figma.currentPage.appendChild(n); return n; };
    }
    return figma;
  }
  if (typeof module !== 'undefined') module.exports = { createFigma };
  else root.createFigmaMock = createFigma;
})(typeof window !== 'undefined' ? window : globalThis);
