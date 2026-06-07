import { API_BASE_URL, RESPONSE_HEADERS, type EventContext, handlePathParam, createNotFoundResponse, createSuccessResponse } from "../_common.js";
import { getStore } from "@edgeone/pages-blob";

export async function onRequestGet(context: EventContext): Promise<Response> {
    if (!API_BASE_URL) {
        return new Response(JSON.stringify({ error: "API_BASE_URL is not set" }), {
            status: 500,
            headers: RESPONSE_HEADERS,
        });
    }

    const store = getStore('seerapi-v1');
    const { params } = context;
    const paths = handlePathParam(params.default);
    const fullPath = [...paths, 'index.json'];
    const data = await store.get(`schemas/${fullPath.join('/')}`, { type: 'json' });

    if (!data) {
        const back = await store.get(`schemas/${paths.join('/') + '.json'}`, { type: 'json' });
        if (!back) {
            return createNotFoundResponse();
        }
        return createSuccessResponse(back, 200, 'OK', {
            'Content-Type': 'application/schema+json',
        });
    }
    return createSuccessResponse(data, 200, 'OK', {
        'Content-Type': 'application/schema+json',
    });
}

export async function onRequestOptions(): Promise<Response> {
    return new Response(null, {
        status: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
        },
    });
}