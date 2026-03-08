// This file configures the initialization of Sentry on the browser.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://bcd2a36013b0de8c75c6191a24793c67@o4511006837637120.ingest.de.sentry.io/4511006855790672",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,

  // Ignore Next.js internal errors that are not actionable
  ignoreErrors: [
    // Next.js devtools internal error (triggered by missing metadataBase)
    "Cannot read properties of undefined (reading 'includes')",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
