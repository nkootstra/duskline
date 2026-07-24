import { createMiddleware, createStart } from "@tanstack/react-start";

const preventDocumentCaching = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    const result = await next();
    const contentType = result.response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html")) {
      return result;
    }

    const headers = new Headers(result.response.headers);
    headers.set("cache-control", "no-store");

    return {
      ...result,
      response: new Response(result.response.body, {
        headers,
        status: result.response.status,
        statusText: result.response.statusText,
      }),
    };
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [preventDocumentCaching],
}));
