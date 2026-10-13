import type { Asset } from "./types";
export async function api<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || data.detail || "처리에 실패했습니다.");
  return data;
}
export function download(
  name: string,
  contents: Blob | string,
  type = "application/json",
) {
  const blob =
    typeof contents === "string"
      ? new Blob([contents.replace(/\r?\n/g, "\r\n")], { type })
      : contents;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("sv-images", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("assets", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function savedAssets(): Promise<Asset[]> {
  const d = await db();
  const rows = await new Promise<Asset[]>((resolve, reject) => {
    const req = d.transaction("assets").objectStore("assets").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  d.close();
  return rows.map((a) => ({ ...a, url: URL.createObjectURL(a.blob!) }));
}
export async function saveAsset(asset: Asset) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction("assets", "readwrite");
    tx.objectStore("assets").put(asset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  d.close();
}
