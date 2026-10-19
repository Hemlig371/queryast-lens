// Номер страницы в пределах 1..число страниц (после удаления элемента последняя страница может исчезнуть).
export function clampPage(page: number, totalItems: number, pageSize: number): number {
  const pages = Math.max(1, Math.ceil(Math.max(0, totalItems) / Math.max(1, pageSize)));
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.floor(page)), pages);
}
