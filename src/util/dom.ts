// Tiny DOM helpers. With no UI framework, keep render logic to small element
// builders bound to RTDB listeners (see CLAUDE.md → Architecture).

type Attrs = Record<string, string | number | boolean | undefined | null>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k.startsWith('data-') || k === 'role' || k === 'aria-label' || k === 'href' || k === 'src' || k === 'type' || k === 'placeholder' || k === 'value' || k === 'maxlength' || k === 'title' || k === 'alt')
      node.setAttribute(k, String(v));
    else (node as Record<string, unknown>)[k] = v;
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function mount(root: HTMLElement, ...nodes: Child[]): void {
  clear(root);
  for (const n of nodes) {
    if (n === null || n === undefined || n === false) continue;
    root.append(typeof n === 'string' ? document.createTextNode(n) : n);
  }
}

/** Truncate a display name to 20 chars with an ellipsis (per layout rules). */
export function truncateName(name: string, max = 20): string {
  return name.length > max ? name.slice(0, max) + '…' : name;
}
