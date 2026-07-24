const baseUrl = new URL(process.argv[2] ?? "https://duskline.kootstra.io");
const maxAttempts = 8;
const retryDelayMs = 1_000;

const fetchOk = async (path: string, expectedContentType: string) => {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    cache: "no-store",
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

const verifyDeployment = async () => {
  const documentUrl = new URL("/", baseUrl);
  documentUrl.searchParams.set("deployment-check", Date.now().toString());
  const documentResponse = await fetchOk(
    `${documentUrl.pathname}${documentUrl.search}`,
    "text/html",
  );
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

  await Promise.all([
    ...assetPaths.map((path) =>
      fetchOk(path, path.endsWith(".css") ? "text/css" : "javascript"),
    ),
    ...["/current.json", "/changes.json", "/source-status.json"].map(
      async (path) => {
        const response = await fetchOk(path, "application/json");
        await response.json();
      },
    ),
  ]);

  return assetPaths.length;
};

let verifiedAssetCount = 0;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    verifiedAssetCount = await verifyDeployment();
    break;
  } catch (error) {
    if (attempt === maxAttempts) {
      throw error;
    }

    await Bun.sleep(retryDelayMs * attempt);
  }
}

console.log(
  `Verified ${baseUrl.origin}: document, ${verifiedAssetCount} assets, and 3 data files`,
);
