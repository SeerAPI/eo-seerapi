import got, { type ExtendOptions } from "got";

export const API_DATA_BASE_URL = process.env.API_DATA_BASE_URL!;
export const API_SCHEMA_BASE_URL = process.env.API_SCHEMA_BASE_URL!;
export const API_BASE_URL = process.env.API_BASE_URL!;

const gotConfig: ExtendOptions = {
	timeout: {
		request: 10000,
	},
	retry: {
		limit: 3,
	},
	headers: {
		"Content-Type": "application/json",
	},
	hooks: {
		beforeError: [
			(error) => {
				console.error('处理请求时出错:', error.options?.url?.toString());
				return error;
			},
		],
		beforeRetry: [
			(error, retryCount) => {
				console.error(`请求重试 (第${retryCount}次): ${error.message || error}`);
				console.error(`错误详情: ${JSON.stringify({
					code: error.code,
					statusCode: error.response?.statusCode,
					url: error.options?.url?.toString(),
					method: error.options?.method
				}, null, 2)}`);
			},
		],
	},
};

export const gotClient = got.extend(gotConfig);

export interface EventContext {
	request: Request;
	env: Record<string, string>;
	params: Record<string, any>;
}

export const RESPONSE_HEADERS = {
	'Content-Type': 'application/json',
	'Access-Control-Allow-Origin': '*',
	'Cache-Control': 'no-cache'
};

/**
 * 从响应中提取 ETag
 */
export function extractEtag(data: any, responseHeaders: Record<string, any>): string {
	return (
		data.hash
		|| responseHeaders['etag']
		|| Date.now().toString()
	);
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
 * 通用请求处理包装器
 */
export async function handleRequest<T>(
	url: string | URL,
	transformer: (data: T, etag: string) => { body: any; headers?: Record<string, string> }
): Promise<Response> {
	try {
		const response = await gotClient.get(url);
		const data: T = JSON.parse(response.body);
		const etag = extractEtag(data, response.headers);

		const { body, headers = {} } = transformer(data, etag);

		return createSuccessResponse(
			body,
			response.statusCode || 200,
			response.statusMessage || 'OK',
			{ ...headers, 'ETag': etag }
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
