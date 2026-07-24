import { createMiddleware, createStart } from "@tanstack/react-start";
import { applyCachePolicy } from "./lib/cache-policy.server";

const applyResponseCachePolicy = createMiddleware({ type: "request" }).server(
  async ({ handlerType, next, pathname, request }) => {
    const result = await next();

    return {
      ...result,
      response: applyCachePolicy({
        handlerType,
        pathname,
        request,
        response: result.response,
      }),
    };
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [applyResponseCachePolicy],
}));
