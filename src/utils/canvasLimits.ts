// Ограничения холста для экспорта картинок (html-to-image рисует через <canvas>).
// Chromium/WebView2: сторона до 16384 px, площадь до ~268 млн px; Android WebView и память — строже.
// Если картинка не помещается, холст получается пустым или экспорт молча падает — поэтому масштаб снижаем.

const MAX_SIDE = 16000;
const MAX_AREA = 1.2e8; // ~ 10000 x 12000 px

/** Масштаб (pixelRatio) <= desired, при котором картинка width x height помещается в холст. */
export function safePixelRatio(width: number, height: number, desired = 2): number {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return Math.min(desired, MAX_SIDE / Math.max(w, h), Math.sqrt(MAX_AREA / (w * h)));
}
