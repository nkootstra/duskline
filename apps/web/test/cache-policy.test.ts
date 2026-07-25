import { describe, expect, it } from "vitest";
import {
  EDGE_DOCUMENT_CACHE_CONTROL,
  applyCachePolicy,
} from "../src/lib/cache-policy.server";

const htmlResponse = (headers?: HeadersInit) =>
  new Response("<!doctype html>", {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...headers,
    },
  });

const apply = ({
  handlerType = "router",
  pathname = "/",
  request = new Request("https://duskline.kootstra.io/"),
  response = htmlResponse(),
}: Partial<Parameters<typeof applyCachePolicy>[0]> = {}) =>
  applyCachePolicy({ handlerType, pathname, request, response });

describe("worker cache policy", () => {
  it("keeps public documents out of browser caches and enables edge caching", () => {
    const response = apply();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
      EDGE_DOCUMENT_CACHE_CONTROL,
    );
  });

  it("allows HEAD requests to use the document cache", () => {
    const response = apply({
      request: new Request("https://duskline.kootstra.io/", {
        method: "HEAD",
      }),
    });

    expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
      EDGE_DOCUMENT_CACHE_CONTROL,
    );
  });

  it.each(["/sources", "/models/example"])(
    "edge-caches public trust document %s",
    (pathname) => {
      const response = apply({
        pathname,
        request: new Request(`https://duskline.kootstra.io${pathname}`),
      });

      expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
        EDGE_DOCUMENT_CACHE_CONTROL,
      );
    },
  );

  it.each([
    {
      name: "server functions",
      input: { handlerType: "serverFn" as const },
    },
    {
      name: "other routes",
      input: { pathname: "/health" },
    },
    {
      name: "non-HTML responses",
      input: {
        response: Response.json({ ok: true }),
      },
    },
    {
      name: "error responses",
      input: {
        response: new Response("error", {
          headers: { "content-type": "text/html" },
          status: 500,
        }),
      },
    },
    {
      name: "authenticated requests",
      input: {
        request: new Request("https://duskline.kootstra.io/", {
          headers: { authorization: "Bearer test" },
        }),
      },
    },
    {
      name: "requests with cookies",
      input: {
        request: new Request("https://duskline.kootstra.io/", {
          headers: { cookie: "session=test" },
        }),
      },
    },
    {
      name: "responses that set cookies",
      input: {
        response: htmlResponse({ "set-cookie": "session=test" }),
      },
    },
  ])("does not edge-cache $name", ({ input }) => {
    const response = apply(input);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("cloudflare-cdn-cache-control")).toBe(false);
  });

  it("removes an upstream edge-cache directive from ineligible responses", () => {
    const response = apply({
      handlerType: "serverFn",
      response: Response.json(
        { ok: true },
        {
          headers: {
            "cloudflare-cdn-cache-control": "public, max-age=3600",
          },
        },
      ),
    });

    expect(response.headers.has("cloudflare-cdn-cache-control")).toBe(false);
  });
});
