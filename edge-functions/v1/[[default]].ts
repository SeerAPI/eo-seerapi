import {
    API_BASE_URL,
    RESPONSE_HEADERS,
    type EventContext,
    buildUrl,
    createSuccessResponse,
    createNotFoundResponse,
    stringIsInteger,
    handlePathParam,
    createNotModifiedResponse,
    getEtagFromRequest,
    etagMatches,
    formatEtag,
    type EdgeOneRequest
} from "./_common.js";
import { getStore } from "@edgeone/pages-blob";


interface PageQueryParam {
    offset: number;
    limit: number;
    expand?: boolean;
}

interface ShardIdIndex {
    by_id: Record<string, string>;
    resource_hash: string;
}

interface ShardNameIndex {
    by_name: Record<string, number[]>;
    // resource_hash: string;
}

type DataStore = ReturnType<typeof getStore>;

function buildPageEtag(resourceHash: string, pageParam: PageQueryParam): string {
    const expandSuffix = pageParam.expand ? '-expanded' : '';
    return `${resourceHash}-${pageParam.offset}-${pageParam.limit}${expandSuffix}`;
}

function getSortedIdKeys(byId: Record<string, string>): string[] {
    return Object.keys(byId).sort((a, b) => Number(a) - Number(b));
}

async function getShardIdIndex(store: DataStore, resourceName: string): Promise<ShardIdIndex | null> {
    return store.get(`sharded_data/${resourceName}/id-index.json`, { type: 'json' });
}

async function getShardNameIndex(store: DataStore, resourceName: string): Promise<ShardNameIndex | null> {
    return store.get(`sharded_data/${resourceName}/name-index.json`, { type: 'json' });
}

async function tryGetResourceHash(store: DataStore, resourceName: string): Promise<string | null> {
    const hash = await store.get(`sharded_data/${resourceName}/resource.hash`, { type: 'text' });
    return hash ? hash.trim() : null;
}

function tryNotModifiedResponse(requestEtag: string, etag: string): Response | null {
    if (etagMatches(requestEtag, etag)) {
        return createNotModifiedResponse(etag);
    }
    return null;
}

async function fetchShardRecord(
    store: DataStore,
    resourceName: string,
    shardFilename: string,
    id: string
): Promise<any> {
    const data = await store.get(`sharded_data/${resourceName}/id/shards/${shardFilename}.json`, { type: 'json' });
    if (!data) {
        throw new Error(`Data not found: ${resourceName}/${id}`);
    }
    return data[id];
}

async function fetchShardRecordById(
    store: DataStore,
    resourceName: string,
    id: string,
    idIndex: ShardIdIndex
): Promise<any | null> {
    const shardFilename = idIndex.by_id[id];
    if (!shardFilename) {
        return null;
    }
    return fetchShardRecord(store, resourceName, shardFilename, id);
}

async function fetchShardRecordsByName(
    store: DataStore,
    resourceName: string,
    name: string,
    idIndex: ShardIdIndex,
    nameIndex: ShardNameIndex
): Promise<Record<string, any> | null> {
    const ids = nameIndex.by_name[name];
    if (!ids) {
        return null;
    }
    const sortedIds = [...ids].sort((a, b) => a - b);
    const result: Record<string, any> = {};
    for (const id of sortedIds) {
        const idStr = id.toString();
        const shardFilename = idIndex.by_id[idStr];
        const data = await store.get(`sharded_data/${resourceName}/id/shards/${shardFilename}.json`, { type: 'json' });
        result[id] = data[idStr];
    }
    return result;
}

async function fetchShardRecordsByIds(
    store: DataStore,
    resourceName: string,
    ids: string[],
    idIndex: ShardIdIndex
): Promise<any[]> {
    const shardCache = new Map<string, Record<string, any>>();
    const results: any[] = [];

    for (const id of ids) {
        const shardFilename = idIndex.by_id[id];
        if (!shardFilename) {
            continue;
        }
        if (!shardCache.has(shardFilename)) {
            const data = await store.get(`sharded_data/${resourceName}/id/shards/${shardFilename}.json`, { type: 'json' });
            if (!data) {
                throw new Error(`Data not found: ${resourceName}/${id}`);
            }
            shardCache.set(shardFilename, data);
        }
        results.push(shardCache.get(shardFilename)![id]);
    }
    return results;
}

function parseExpandQueryParam(queryParams: URLSearchParams): boolean {
    if (!queryParams.has('expand')) {
        return false;
    }
    const value = queryParams.get('expand');
    return value === null || value === '' || value === 'true' || value === '1';
}

function buildPageUrl(url: string | URL, queryParam?: PageQueryParam | null): URL | null {
    if (!queryParam) {
        return null;
    }
    url = new URL(url);
    url.searchParams.set('offset', queryParam.offset.toString());
    url.searchParams.set('limit', queryParam.limit.toString());
    if (queryParam.expand) {
        url.searchParams.set('expand', 'true');
    }
    return url;
}

function getNextPage(pageParam: PageQueryParam, count: number): PageQueryParam | null {
    const nextOffset = pageParam.offset + pageParam.limit;
    if (nextOffset < count) {
        return {
            offset: nextOffset,
            limit: pageParam.limit,
            ...(pageParam.expand ? { expand: true } : {}),
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
            ...(pageParam.expand ? { expand: true } : {}),
        };
    }
    return null;
}

function getFirstPage(pageParam: PageQueryParam): PageQueryParam {
    return {
        offset: 0,
        limit: pageParam.limit,
        ...(pageParam.expand ? { expand: true } : {}),
    };
}

function getLastPage(pageParam: PageQueryParam, count: number): PageQueryParam {
    const lastOffset = Math.max(0, Math.floor((count - 1) / pageParam.limit) * pageParam.limit);
    return {
        offset: lastOffset,
        limit: pageParam.limit,
        ...(pageParam.expand ? { expand: true } : {}),
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

async function handleDataRequest(
    path: string[],
    request: EdgeOneRequest,
    queryParams: URLSearchParams = new URLSearchParams()
): Promise<Response> {
    const [resource_name, name] = path
    const store = getStore('seerapi-v1');
    if (!resource_name) {
        return createSuccessResponse(
            await store.get(`sharded_data/index.json`, { type: 'json' })
        );
    }
    const requestEtag = getEtagFromRequest(request);

    // 如果没有二级路径，则查找一级路径是资源名称还是文件名称，
    if (!name) {
        const pageParam = {
            offset: parseInt(queryParams.get('offset') || '0') || 0,
            limit: parseInt(queryParams.get('limit') || '20') || 20,
            expand: parseExpandQueryParam(queryParams),
        };
        if (pageParam.limit > 200) {
            return new Response(JSON.stringify({ error: "Limit is too large" }), {
                status: 400,
                headers: RESPONSE_HEADERS,
            });
        }

        // 快速路径：仅读取 resource.hash 即可完成条件请求，跳过 id-index.json
        const resourceHash = await tryGetResourceHash(store, resource_name);
        if (resourceHash) {
            const earlyResponse = tryNotModifiedResponse(requestEtag, buildPageEtag(resourceHash, pageParam));
            if (earlyResponse) {
                return earlyResponse;
            }
        }

        const idIndex = await getShardIdIndex(store, resource_name);
        // 如果id索引不存在，则尝试直接返回文件
        if (!idIndex) {
            const data = await store.get(`sharded_data/${resource_name}.json`, { type: 'json' });
            if (!data) {
                return createNotFoundResponse();
            }
            const schemaUrl = buildUrl(API_BASE_URL, ['schemas', resource_name]);
            return createSuccessResponse(data, 200, 'OK', {
                'Link': `<${schemaUrl}>; rel="describedby"`,
                'Content-Type': 'application/schema-instance+json',
            });
        }

        const hash = resourceHash ?? idIndex.resource_hash;
        if (!resourceHash) {
            const notModified = tryNotModifiedResponse(requestEtag, buildPageEtag(hash, pageParam));
            if (notModified) {
                return notModified;
            }
        }

        const url = buildUrl(API_BASE_URL, [resource_name]);
        const idKeys = getSortedIdKeys(idIndex.by_id);
        const count = idKeys.length;

        const nextUrl = buildPageUrl(url, getNextPage(pageParam, count));
        const prevUrl = buildPageUrl(url, getPreviousPage(pageParam));
        const firstUrl = buildPageUrl(url, getFirstPage(pageParam));
        const lastUrl = buildPageUrl(url, getLastPage(pageParam, count));
        const pageIds = idKeys.slice(pageParam.offset, pageParam.offset + pageParam.limit);
        const results = pageParam.expand
            ? await fetchShardRecordsByIds(store, resource_name, pageIds, idIndex)
            : pageIds.map((idStr) => ({
                id: parseInt(idStr),
                url: buildUrl(API_BASE_URL, [resource_name, idStr]).toString(),
            }));
        const pageEtag = buildPageEtag(hash, pageParam);
        const schemaUrl = buildUrl(API_BASE_URL, ['schemas', resource_name]);
        return createSuccessResponse(
            {
                count: count,
                next: nextUrl,
                previous: prevUrl,
                first: firstUrl,
                last: lastUrl,
                results,
                hash,
            },
            200,
            'OK',
            {
                'ETag': formatEtag(pageEtag),
                'Link': buildLinkHeader(API_BASE_URL, pageParam, count, schemaUrl),
                'Content-Type': 'application/schema-instance+json',
            }
        );
    }

    const resourceHash = await tryGetResourceHash(store, resource_name);
    if (resourceHash) {
        const earlyResponse = tryNotModifiedResponse(requestEtag, resourceHash);
        if (earlyResponse) {
            return earlyResponse;
        }
    }

    const idIndex = await getShardIdIndex(store, resource_name);
    if (!idIndex) {
        return createNotFoundResponse();
    }

    const hash = resourceHash ?? idIndex.resource_hash;
    if (!resourceHash) {
        const notModified = tryNotModifiedResponse(requestEtag, hash);
        if (notModified) {
            return notModified;
        }
    }

    if (stringIsInteger(name)) {
        const record = await fetchShardRecordById(store, resource_name, name, idIndex);
        if (record === null) {
            return createNotFoundResponse();
        }
        const schemaUrl = buildUrl(API_BASE_URL, ['schemas', resource_name, '$id']);
        return createSuccessResponse(record, 200, 'OK', {
            'Link': `<${schemaUrl}>; rel="describedby"`,
            'ETag': formatEtag(hash),
            'Content-Type': 'application/schema-instance+json',
        });
    }

    const nameIndex = await getShardNameIndex(store, resource_name);
    if (!nameIndex) {
        return createNotFoundResponse();
    }

    const result = await fetchShardRecordsByName(store, resource_name, name, idIndex, nameIndex);
    if (result === null) {
        return createNotFoundResponse();
    }

    const schemaUrl = buildUrl(API_BASE_URL, ['schemas', resource_name, '$name']);
    return createSuccessResponse(result, 200, 'OK', {
        'Link': `<${schemaUrl}>; rel="describedby"`,
        'ETag': formatEtag(hash),
        'Content-Type': 'application/schema-instance+json',
    });
}

/**
 * EdgeOne Pages Function Handler - 处理 GET 请求
 */
export async function onRequestGet(context: EventContext): Promise<Response> {
    if (!API_BASE_URL) {
        return new Response(JSON.stringify({ error: "API_BASE_URL is not set" }), {
            status: 500,
            headers: RESPONSE_HEADERS,
        });
    }

    const { request, params } = context;
    const url = new URL(request.url, API_BASE_URL);
    const { searchParams } = url;

    const paths = handlePathParam(params.default);
    return await handleDataRequest(paths, request, searchParams);
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
