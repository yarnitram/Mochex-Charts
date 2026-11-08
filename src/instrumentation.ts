/**
 * Next.js Server Lifecycle Instrumentation (DEC-135)
 * Initializes 24/7 Offline Cloud Alert Daemon on Node.js server startup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { serverAlertDaemon } = await import("@/lib/alerts/server-alert-daemon");
    serverAlertDaemon.start().catch((err) => {
      console.warn("[instrumentation] Failed to start ServerAlertDaemon:", err);
    });
  }
}
