const baseUrl = new URL(process.argv[2] ?? "https://duskline.kootstra.io");

const fetchOk = async (path: string, expectedContentType: string) => {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
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

const documentResponse = await fetchOk("/", "text/html");
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
  throw new Error("The deployed document did not reference CSS and JS assets");
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

console.log(
  `Verified ${baseUrl.origin}: document, ${assetPaths.length} assets, and 3 data files`,
);
