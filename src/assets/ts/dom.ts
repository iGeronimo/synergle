import { withBase } from "./config";

type Child = Node | string | null | undefined | false;

/** Tiny element builder: el("p", { class: "x" }, "text", otherNode). Root-relative href/src get the base path. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if ((key === "href" || key === "src") && typeof value === "string") node.setAttribute(key, withBase(value));
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

let toastTimer: number | undefined;

/** Shows a short message in the toast live region. */
export function toast(message: string, ms = 1800): void {
  const region = document.getElementById("toast");
  if (!region) return;
  window.clearTimeout(toastTimer);
  region.replaceChildren(el("div", { class: "toast" }, message));
  toastTimer = window.setTimeout(() => region.replaceChildren(), ms);
}

export function openDialog(id: string): HTMLDialogElement | null {
  const dialog = document.getElementById(id) as HTMLDialogElement | null;
  if (!dialog) return null;
  if (!dialog.open) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  return dialog;
}
