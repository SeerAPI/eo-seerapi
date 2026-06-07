export const API_BASE_URL = env.API_BASE_URL!;

export interface EdgeOneRequest {
    headers: Headers;
    url: string;
}

export type PathParam = string | string[] | undefined;
export interface EventContext {
    request: EdgeOneRequest;
    env: Record<string, string>;
    params: Record<string, PathParam>;
}

export const RESPONSE_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
};


/**
 * 从请求头中提取 If-None-Match
 */
export function getEtagFromRequest(request: EdgeOneRequest): string {
    return request.headers.get('if-none-match') || request.headers.get('If-None-Match') || '';
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
    return etag.trim().replace(/^W\//, '').replace(/^"/, '').replace(/"$/, '');
}

/**
 * 判断 If-None-Match 是否与当前 ETag 匹配
 */
export function etagMatches(ifNoneMatch: string, etag: string): boolean {
    if (!ifNoneMatch || !etag) {
        return false;
    }
    if (ifNoneMatch.trim() === '*') {
        return true;
    }
    const normalized = normalizeEtag(etag);
    return ifNoneMatch.split(',').some((tag) => normalizeEtag(tag) === normalized);
}

/**
 * 创建错误响应
 */
export function createErrorResponse(error: any): Response {
    return new Response(JSON.stringify({ error: error?.message || String(error) }), {
        status: 502,
        headers: RESPONSE_HEADERS,
    });
}

export function createNotFoundResponse(): Response {
    return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: RESPONSE_HEADERS,
    });
}

/**
 * 创建成功响应
 */
export function createSuccessResponse(
    data: any,
    statusCode: number = 200,
    statusMessage: string = 'OK',
    additionalHeaders: Record<string, string> = {}
): Response {
    return new Response(JSON.stringify(data), {
        status: statusCode,
        statusText: statusMessage,
        headers: { ...RESPONSE_HEADERS, ...additionalHeaders },
    });
}

/**
 * 创建 304 响应
 */
export function createNotModifiedResponse(etag?: string): Response {
    const headers: Record<string, string> = { ...RESPONSE_HEADERS };
    if (etag) {
        headers['ETag'] = formatEtag(etag);
    }
    return new Response(null, {
        status: 304,
        headers,
    });
}

export function buildUrl(baseUrl: string | URL, path: string[] = []): URL {
    const url = new URL(baseUrl);
    url.pathname += path.join('/');
    return url;
}

export function stringIsInteger(str: string): boolean {
    return /^\d+$/.test(str);
}

export function handlePathParam(path: PathParam): string[] {
    if (Array.isArray(path)) {
        return path.map(p => decodeURIComponent(p));
    } else if (path) {
        return [decodeURIComponent(path)];
    } else {
        return [];
    }
}
