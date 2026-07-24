export const EDGE_DOCUMENT_CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=60, stale-if-error=86400";

type CachePolicyInput = {
  handlerType: "router" | "serverFn";
  pathname: string;
  request: Request;
  response: Response;
};

const isCacheableDocument = ({
  handlerType,
  pathname,
  request,
  response,
}: CachePolicyInput) => {
  const contentType = response.headers.get("content-type") ?? "";

  return (
    handlerType === "router" &&
    pathname === "/" &&
    (request.method === "GET" || request.method === "HEAD") &&
    response.status === 200 &&
    contentType.includes("text/html") &&
    !request.headers.has("authorization") &&
    !request.headers.has("cookie") &&
    !response.headers.has("set-cookie")
  );
};

export const applyCachePolicy = (input: CachePolicyInput) => {
  const headers = new Headers(input.response.headers);

  headers.set("cache-control", "no-store");
  headers.delete("cloudflare-cdn-cache-control");

  if (isCacheableDocument(input)) {
    headers.set("cloudflare-cdn-cache-control", EDGE_DOCUMENT_CACHE_CONTROL);
  }

  return new Response(input.response.body, {
    headers,
    status: input.response.status,
    statusText: input.response.statusText,
  });
};
