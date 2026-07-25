import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  CurrentDataset,
  buildLifecycleEntries,
  lifecycleIdentityKey,
} from "../../packages/lifecycle/src";
import current from "../../data/current.json";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const outputRoot = fileURLToPath(new URL("./dist", import.meta.url));
const lifecycle = Schema.decodeUnknownSync(CurrentDataset)(current);
const passportPages = await Promise.all(
  buildLifecycleEntries(
    lifecycle.records,
    new Date().toISOString().slice(0, 10),
  ).map(async (entry) => ({
    path: `/models/${await lifecycleIdentityKey(entry.identity)}`,
  })),
);

export default defineConfig({
  root: appRoot,
  build: { outDir: outputRoot },
  publicDir: "../../data",
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      pages: [{ path: "/" }, { path: "/sources" }, ...passportPages],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        concurrency: 8,
        failOnError: true,
      },
    }),
    react(),
  ],
});
