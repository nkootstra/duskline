import { Effect } from "effect";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";

const compatibility = {
  date: "2026-07-11",
  flags: ["nodejs_compat" as const],
};

const edgeDocumentCacheControl =
  "public, max-age=300, stale-while-revalidate=60, stale-if-error=86400";

const staticAssetHeaders = `/assets/*
  Cache-Control: public, max-age=31536000, immutable`;

const documentHeaders = ["/", "/sources", "/models/*"]
  .map(
    (path) => `${path}
  Cache-Control: no-store
  Cloudflare-CDN-Cache-Control: ${edgeDocumentCacheControl}`,
  )
  .join("\n\n");

const assetHeaders = `${staticAssetHeaders}

${documentHeaders}`;

export default Alchemy.Stack(
  "duskline",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const web = yield* Cloudflare.Website.Vite("LifecycleWeb", {
      rootDir: "./apps/web",
      compatibility,
      cache: {
        enabled: true,
        crossVersionCache: false,
      },
      assets: {
        headers: assetHeaders,
      },
      domain: "duskline.kootstra.io",
      url: true,
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: true },
      },
    });

    return { web };
  }),
);
