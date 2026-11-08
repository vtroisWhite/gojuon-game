export function normalizeAppUrl(base: string): void {
  const appPath = base.replace(/\/+$/, '');
  if (!appPath || !appPath.startsWith('/') || window.location.pathname === appPath) return;
  if (window.location.pathname.replace(/\/+$/, '') !== appPath) return;
  window.history.replaceState(
    window.history.state,
    '',
    appPath + window.location.search + window.location.hash,
  );
}
