import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { contentSecurityPolicy, createCspNonce } from "~/lib/security-headers";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
): Promise<Response> {
  let status = responseStatusCode;
  const nonce = createCspNonce();
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    {
      signal: request.signal,
      onError(error: unknown) {
        console.error(error);
        status = 500;
      },
    },
  );

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  return new Response(body, {
    headers: responseHeaders,
    status,
  });
}
