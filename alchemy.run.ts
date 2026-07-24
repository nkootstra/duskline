import { Effect } from "effect";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";

const compatibility = {
  date: "2026-07-11",
  flags: ["nodejs_compat" as const],
};

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
      assets: { runWorkerFirst: true },
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
