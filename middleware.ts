/**
 * EdgeOne 回源到 Cloud Function 时会剥离 If-None-Match，
 * 在边缘中间件将其复制到 X-If-None-Match 再转发，供条件缓存使用。
 */
const ETAG_FALLBACK_HEADER = "x-if-none-match";

interface MiddlewareContext {
  request: Request;
  next: (options?: { headers?: Record<string, string> }) => Response;
}

export function middleware(context: MiddlewareContext): Response {
  const ifNoneMatch = context.request.headers.get("if-none-match");
  if (!ifNoneMatch) {
    return context.next();
  }

  return context.next({
    headers: {
      [ETAG_FALLBACK_HEADER]: ifNoneMatch,
    },
  });
}

export const config = {
  matcher: ["/v1/:path*"],
};
