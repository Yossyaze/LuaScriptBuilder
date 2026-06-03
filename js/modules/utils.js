/**
 * 指定したIDの要素から数値を取得する。不正な値の場合はfallbackを返す。
 */
export function num(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = Number(el.value);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * 指定したIDの要素からテキストを取得する。空の場合はfallbackを返す。
 */
export function txt(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = el.value.trim();
  return v || fallback;
}

/**
 * Luaの文字列リテラル用にエスケープする。
 */
export function luaString(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

/**
 * HTMLエスケープを行う。
 */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
