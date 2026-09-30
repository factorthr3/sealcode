export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build')
    return;
  const { silenceConsole } = await import('@sealcode/shared/logger');
  const { logger } = await import('./lib/logger');
  if (process.env.NODE_ENV === 'production') silenceConsole(logger);
  const { dispatchNotifications } = await import('./lib/notifications');
  // A single web replica sends queued budget alerts every 30 seconds.
  const timer = setInterval(() => {
    dispatchNotifications().catch(() => undefined);
  }, 30_000);
  timer.unref();
}
