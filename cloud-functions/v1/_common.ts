import { gzipSync } from "zlib";

export const API_BASE_URL = env.API_BASE_URL!;

export interface EdgeOneRequest {
  headers: Headers | Record<string, string>;
  url: string;
}

export type PathParam = string | string[] | undefined;
export interface EventContext {
  request: EdgeOneRequest;
  env: Record<string, string>;
  params: Record<string, PathParam>;
}

export const RESPONSE_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-cache",
};

/**
 * 读取请求头（兼容 Headers 实例与普通对象；EdgeOne 运行时两者都可能出现）
 */
function getRequestHeader(
  headers: Headers | Record<string, string> | undefined,
  name: string,
): string {
  if (!headers) {
    return "";
  }
  if (typeof (headers as Headers).get === "function") {
    return (
      (headers as Headers).get(name) ||
      (headers as Headers).get(name.toLowerCase()) ||
      ""
    );
  }
  const plain = headers as Record<string, string>;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(plain)) {
    if (key.toLowerCase() === lower && value != null) {
      return String(value);
    }
  }
  return "";
}

/**
 * 从请求头中提取 If-None-Match
 */
export function getEtagFromRequest(request: EdgeOneRequest): string {
  return getRequestHeader(request.headers, "if-none-match");
}

/**
 * 格式化为 HTTP 强 ETag（带引号）
 */
export function formatEtag(value: string): string {
  const normalized = normalizeEtag(value);
  return `"${normalized}"`;
}

/**
 * 规范化 ETag 值以便比较（去除 W/ 前缀与引号）
 */
export function normalizeEtag(etag: string): string {
  return etag.trim().replace(/^W\//, "").replace(/^"/, "").replace(/"$/, "");
}

/**
 * 判断 If-None-Match 是否与当前 ETag 匹配
 */
export function etagMatches(ifNoneMatch: string, etag: string): boolean {
  if (!ifNoneMatch || !etag) {
    return false;
  }
  if (ifNoneMatch.trim() === "*") {
    return true;
  }
  const normalized = normalizeEtag(etag);
  return ifNoneMatch
    .split(",")
    .some((tag) => normalizeEtag(tag) === normalized);
}

/**
 * 创建错误响应
 */
export function createErrorResponse(error: any): Response {
  return new Response(
    JSON.stringify({ error: error?.message || String(error) }),
    {
      status: 502,
      headers: RESPONSE_HEADERS,
    },
  );
}

export function createNotFoundResponse(): Response {
  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: RESPONSE_HEADERS,
  });
}

/**
 * 是否应对响应做 gzip。
 * EdgeOne 回源到 Cloud Function 时经常剥离 Accept-Encoding，
 * 若完全缺失则默认压缩（浏览器/常见客户端均支持 gzip）。
 */
export function clientAcceptsGzip(request: EdgeOneRequest): boolean {
  const acceptEncoding = getRequestHeader(request.headers, "accept-encoding");
  if (!acceptEncoding.trim()) {
    return true;
  }
  if (/\bgzip\b/i.test(acceptEncoding)) {
    return true;
  }
  // 明确只接受 identity / 其它编码时不压缩
  return false;
}

export interface SuccessResponseOptions {
  /** 使用 gzip level=6 压缩响应体 */
  gzip?: boolean;
}

function buildBodyResponse(
  body: string,
  statusCode: number,
  statusMessage: string,
  additionalHeaders: Record<string, string>,
  options: SuccessResponseOptions,
): Response {
  const headers: Record<string, string> = {
    ...RESPONSE_HEADERS,
    ...additionalHeaders,
  };

  if (options.gzip) {
    const compressed = gzipSync(body, { level: 6 });
    headers["Content-Encoding"] = "gzip";
    headers["Content-Length"] = String(compressed.byteLength);
    headers["Vary"] = headers["Vary"]
      ? `${headers["Vary"]}, Accept-Encoding`
      : "Accept-Encoding";
    return new Response(compressed, {
      status: statusCode,
      statusText: statusMessage,
      headers,
    });
  }

  headers["Content-Length"] = String(Buffer.byteLength(body, "utf-8"));
  return new Response(body, {
    status: statusCode,
    statusText: statusMessage,
    headers,
  });
}

/**
 * 创建成功响应（会 JSON.stringify）
 */
export function createSuccessResponse(
  data: any,
  statusCode: number = 200,
  statusMessage: string = "OK",
  additionalHeaders: Record<string, string> = {},
  options: SuccessResponseOptions = {},
): Response {
  return buildBodyResponse(
    JSON.stringify(data),
    statusCode,
    statusMessage,
    additionalHeaders,
    options,
  );
}

/**
 * 整文件直出：已是 JSON 文本，跳过 parse/stringify
 */
export function createRawJsonResponse(
  body: string,
  statusCode: number = 200,
  statusMessage: string = "OK",
  additionalHeaders: Record<string, string> = {},
  options: SuccessResponseOptions = {},
): Response {
  return buildBodyResponse(
    body,
    statusCode,
    statusMessage,
    additionalHeaders,
    options,
  );
}

/**
 * 创建 304 响应
 */
export function createNotModifiedResponse(etag?: string): Response {
  const headers: Record<string, string> = { ...RESPONSE_HEADERS };
  if (etag) {
    headers["ETag"] = formatEtag(etag);
  }
  return new Response(null, {
    status: 304,
    headers,
  });
}

export function buildUrl(baseUrl: string | URL, path: string[] = []): URL {
  const url = new URL(baseUrl);
  url.pathname += path.join("/");
  return url;
}

export function stringIsInteger(str: string): boolean {
  return /^\d+$/.test(str);
}

export function handlePathParam(path: PathParam): string[] {
  if (Array.isArray(path)) {
    return path.map((p) => decodeURIComponent(p));
  } else if (path) {
    return [decodeURIComponent(path)];
  } else {
    return [];
  }
}
