export const API_DATA_BASE_URL = env.API_DATA_BASE_URL!;
export const API_SCHEMA_BASE_URL = env.API_SCHEMA_BASE_URL!;
export const API_BASE_URL = env.API_BASE_URL!;

export interface EdgeOneRequest {
	headers: Headers;
	url: string;
}

export interface EventContext {
	request: EdgeOneRequest;
	env: Record<string, string>;
	params: Record<string, any>;
}

export const RESPONSE_HEADERS = {
	'Content-Type': 'application/json',
	'Access-Control-Allow-Origin': '*',
	'Cache-Control': 'no-cache'
};

/**
 * 从数据或后端响应头中提取 ETag
 */
export function extractEtagFromBackend(data: any, responseHeaders: Record<string, any>): string {
	return (
		data.hash
		|| responseHeaders['etag']
		|| responseHeaders['ETag']
		|| Date.now().toString()
	);
}


/**
 * 从请求头中提取 ETag
 */
export function getEtagFromRequest(request: EdgeOneRequest): string {
	return request.headers.get('if-none-match') || request.headers.get('If-None-Match') || '';
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
export function createNotModifiedResponse(): Response {
	return new Response(null, {
		status: 304,
		headers: RESPONSE_HEADERS,
	});
}

/**
 * 通用请求处理包装器
 */
export async function handleRequest<T>(
	url: string | URL,
	request: EdgeOneRequest,
	transformer: (data: T, etag: string) => { body: any; headers?: Record<string, string> }
): Promise<Response> {
	try {
		const response = await fetch(url, {
			headers: {
				"Content-Type": "application/json",
			},
		});
		const data: T = await response.json();
		const remoteEtag = extractEtagFromBackend(data, response.headers);
		const requestEtag = getEtagFromRequest(request);
		// console.log(`requestEtag: ${requestEtag}, remoteEtag: ${remoteEtag}`);

		if (requestEtag === remoteEtag) {
			// console.log('not modified, return 304');
			return createNotModifiedResponse();
		}

		const { body, headers: responseHeaders = {} } = transformer(data, remoteEtag);
		return createSuccessResponse(
			body,
			response.status || 200,
			response.statusText || 'OK',
			{ ...responseHeaders }
		);
	} catch (e: any) {
		return createErrorResponse(e);
	}
}

export function buildUrl(baseUrl: string | URL, path: string[] = []): URL {
	const url = new URL(baseUrl);
	url.pathname += path.join('/');
	return url;
}
