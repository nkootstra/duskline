const baseUrl = new URL(process.argv[2] ?? "https://duskline.kootstra.io");
const maxAttempts = 8;
const retryDelayMs = 1_000;
const deploymentCheck = Date.now().toString();

const cacheBustedPath = (path: string) => {
  const url = new URL(path, baseUrl);
  url.searchParams.set("deployment-check", deploymentCheck);
  return `${url.pathname}${url.search}`;
};

const fetchOk = async (
  path: string,
  expectedContentType: string,
  options: { bypassCache?: boolean } = {},
) => {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    cache: options.bypassCache === false ? "default" : "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`${url.pathname} returned ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes(expectedContentType)) {
    throw new Error(
      `${url.pathname} returned unexpected content type ${contentType}`,
    );
  }

  return response;
};

const verifyDocumentCache = async () => {
  const url = new URL("/", baseUrl);
  url.searchParams.set("deployment-cache-check", Date.now().toString());
  const cacheStatuses: string[] = [];

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetchOk(
      `${url.pathname}${url.search}`,
      "text/html",
      { bypassCache: false },
    );
    const browserCacheControl = response.headers.get("cache-control");
    const cacheStatus = response.headers.get("cf-cache-status") ?? "missing";

    if (browserCacheControl !== "no-store") {
      throw new Error(
        `Document browser cache policy was ${browserCacheControl ?? "missing"}`,
      );
    }

    cacheStatuses.push(cacheStatus);
    if (cacheStatus === "HIT") {
      return cacheStatuses;
    }

    await Bun.sleep(250 * attempt);
  }

  throw new Error(
    `Document did not reach the Worker cache: ${cacheStatuses.join(", ")}`,
  );
};

const verifyDeployment = async () => {
  const documentResponse = await fetchOk(cacheBustedPath("/"), "text/html");
  const html = await documentResponse.text();
  const assetPaths = [
    ...new Set(
      [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)].map(
        ([, path]) => path,
      ),
    ),
  ];

  if (
    !assetPaths.some((path) => path.endsWith(".css")) ||
    !assetPaths.some((path) => path.endsWith(".js"))
  ) {
    throw new Error(
      "The deployed document did not reference CSS and JS assets",
    );
  }
  const passportMatch = html.match(/href="(\/models\/[^"]+)"/);
  if (!passportMatch?.[1]) {
    throw new Error("The deployed document did not link to a model passport");
  }

  const [cacheStatuses] = await Promise.all([
    verifyDocumentCache(),
    ...assetPaths.map(async (path) => {
      const response = await fetchOk(
        path,
        path.endsWith(".css") ? "text/css" : "javascript",
      );
      const cacheControl = response.headers.get("cache-control") ?? "";

      if (
        !cacheControl.includes("max-age=31536000") ||
        !cacheControl.includes("immutable")
      ) {
        throw new Error(`${path} returned cache policy ${cacheControl}`);
      }
    }),
    ...[
      "/check-status.json",
      "/current.json",
      "/changes.json",
      "/source-status.json",
    ].map(async (path) => {
      const response = await fetchOk(cacheBustedPath(path), "application/json");
      const cacheControl = response.headers.get("cache-control") ?? "";

      if (
        cacheControl.includes("max-age=31536000") ||
        cacheControl.includes("immutable")
      ) {
        throw new Error(`${path} returned unsafe cache policy ${cacheControl}`);
      }

      const [deployed, expected] = await Promise.all([
        response.json(),
        Bun.file(new URL(`../../../data${path}`, import.meta.url)).json(),
      ]);
      if (JSON.stringify(deployed) !== JSON.stringify(expected)) {
        throw new Error(`${path} does not match the published artifact`);
      }
    }),
    fetchOk(cacheBustedPath("/sources"), "text/html"),
    fetchOk(cacheBustedPath(passportMatch[1]), "text/html"),
  ]);

  return {
    assetCount: assetPaths.length,
    cacheStatuses,
  };
};

let verifiedDeployment:
  Awaited<ReturnType<typeof verifyDeployment>> | undefined;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    verifiedDeployment = await verifyDeployment();
    break;
  } catch (error) {
    if (attempt === maxAttempts) {
      throw error;
    }

    await Bun.sleep(retryDelayMs * attempt);
  }
}

if (!verifiedDeployment) {
  throw new Error("Deployment verification did not produce a result");
}

console.log(
  `Verified ${baseUrl.origin}: document cache ${verifiedDeployment.cacheStatuses.join(" → ")}, ${verifiedDeployment.assetCount} immutable assets, trust pages, and 4 revalidated data files`,
);
