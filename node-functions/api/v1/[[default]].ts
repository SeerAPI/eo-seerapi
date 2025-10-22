import {
	API_DATA_BASE_URL,
	API_BASE_URL,
	handleRequest,
	RESPONSE_HEADERS,
	type EventContext,
	buildUrl
} from "./_common.js";


interface PageQueryParam {
	offset: number;
	limit: number;
}

interface PageData {
	count: number;
	first: string | null;
	last: string | null;
	next: string | null;
	previous: string | null;
	results: any[];
	hash: string;
}

function buildPageUrl(url: string | URL, queryParam?: PageQueryParam | null): URL | null {
	if (!queryParam) {
		return null;
	}
	url = new URL(url);
	url.searchParams.set('offset', queryParam.offset.toString());
	url.searchParams.set('limit', queryParam.limit.toString());
	return url;
}

function getNextPage(pageParam: PageQueryParam, count: number): PageQueryParam | null {
	const nextOffset = pageParam.offset + pageParam.limit;
	if (nextOffset < count) {
		return {
			offset: nextOffset,
			limit: pageParam.limit,
		};
	}
	return null;
}

function getPreviousPage(pageParam: PageQueryParam): PageQueryParam | null {
	if (pageParam.offset > 0) {
		const previousOffset = Math.max(0, pageParam.offset - pageParam.limit);
		return {
			offset: previousOffset,
			limit: pageParam.limit,
		};
	}
	return null;
}

function getFirstPage(pageParam: PageQueryParam): PageQueryParam {
	return {
		offset: 0,
		limit: pageParam.limit,
	};
}

function getLastPage(pageParam: PageQueryParam, count: number): PageQueryParam {
	const lastOffset = Math.max(0, Math.floor((count - 1) / pageParam.limit) * pageParam.limit);
	return {
		offset: lastOffset,
		limit: pageParam.limit,
	};
}

/**
 * 构建 RFC 5988 Link Header（包含 describedby）
 * @param url 基础 URL
 * @param path 路径
 * @param pageParam 当前分页参数
 * @param count 总数
 * @param schemaUrl Schema URL（可选）
 * @returns Link Header 字符串
 */
function buildLinkHeader(url: string, pageParam: PageQueryParam, count: number, schemaUrl?: URL): string {
	const links: string[] = [];

	// Schema describedby 链接（RFC 5988）
	if (schemaUrl) {
		links.push(`<${schemaUrl.toString()}>; rel="describedby"`);
	}

	// Next 链接
	const nextPage = getNextPage(pageParam, count);
	if (nextPage) {
		const nextUrl = buildPageUrl(url, nextPage);
		if (nextUrl) links.push(`<${nextUrl}>; rel="next"`);
	}

	// Previous 链接
	const prevPage = getPreviousPage(pageParam);
	if (prevPage) {
		const prevUrl = buildPageUrl(url, prevPage);
		if (prevUrl) links.push(`<${prevUrl}>; rel="prev"`);
	}

	// First 链接
	const firstPage = getFirstPage(pageParam);
	const firstUrl = buildPageUrl(url, firstPage);
	if (firstUrl) links.push(`<${firstUrl}>; rel="first"`);

	// Last 链接
	const lastPage = getLastPage(pageParam, count);
	const lastUrl = buildPageUrl(url, lastPage);
	if (lastUrl) links.push(`<${lastUrl}>; rel="last"`);

	return links.join(", ");
}

function dataIsPageData(data: any): data is PageData {
	return (
		data.count !== undefined
		&& data.results !== undefined
		&& data.next !== undefined
		&& data.previous !== undefined
		&& Array.isArray(data.results)
	);
}

async function handleDataRequest(
	path: string[],
	queryParams: URLSearchParams = new URLSearchParams()
): Promise<Response> {
	return await handleRequest(
		buildUrl(API_DATA_BASE_URL, [...path, 'index.json']),
		(data) => {
			const schemaUrl = buildUrl(
				API_BASE_URL,
				['schemas', ...path.map(p => /^\d+$/.test(p) ? '$id' : p)]
			);
			if (!dataIsPageData(data)) {
				return {
					body: data,
					headers: {
						'Link': `<${schemaUrl}>; rel="describedby"`,
						'Content-Type': 'application/schema-instance+json',
					}
				};
			}

			const url = new URL(path.join('/'), API_BASE_URL);
			const pageParam = {
				offset: parseInt(queryParams.get('offset') || '0') || 0,
				limit: parseInt(queryParams.get('limit') || '20') || 20
			};

			// 构建分页链接
			const count = data.count;
			const nextUrl = buildPageUrl(url, getNextPage(pageParam, count));
			const prevUrl = buildPageUrl(url, getPreviousPage(pageParam));
			const firstUrl = buildPageUrl(url, getFirstPage(pageParam));
			const lastUrl = buildPageUrl(url, getLastPage(pageParam, count));

			// 构建 RFC 5988 Link Header（包含 describedby）
			const linkHeader = buildLinkHeader(API_BASE_URL, pageParam, count, schemaUrl);
			return {
				body: {
					count: count,
					next: nextUrl,
					previous: prevUrl,
					first: firstUrl,
					last: lastUrl,
					results: data.results.slice(pageParam.offset, pageParam.offset + pageParam.limit)
				},
				headers: {
					'Link': linkHeader,
					'Content-Type': 'application/schema-instance+json'
				}
			};
		}
	);
}

/**
 * EdgeOne Pages Function Handler - 处理 GET 请求
 */
export async function onRequestGet(context: EventContext): Promise<Response> {
	if (!API_DATA_BASE_URL || !API_BASE_URL) {
		return new Response(JSON.stringify({ error: "API_DATA_BASE_URL or API_BASE_URL is not set" }), {
			status: 500,
			headers: RESPONSE_HEADERS,
		});
	}

	const { request, params } = context;
	const url = new URL(request.url, API_BASE_URL);
	const { searchParams, pathname } = url;

	// 记录请求日志
	console.log(`[${new Date().toISOString()}] GET ${pathname}`);

	// if (!endpoint || id) {
	// 	return await handleNormalPath(endpoint, id);
	// }

	// if (!endpoint) {
	// 	return new Response(JSON.stringify({ error: "Endpoint is required" }), {
	// 		status: 400,
	// 		headers: RESPONSE_HEADERS,
	// 	});
	// }
	// return await handleEndpointListRequest(endpoint, searchParams);
	return await handleDataRequest(params.default ?? [], searchParams);
}

export async function onRequestOptions() {
	return new Response(null, {
		status: 200,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, If-None-Match",
		},
	});
}
