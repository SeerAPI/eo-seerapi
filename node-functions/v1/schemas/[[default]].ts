import { API_BASE_URL, API_SCHEMA_BASE_URL, buildUrl, handleRequest, RESPONSE_HEADERS, type EventContext } from "../_common.js";

export async function onRequestGet(context: EventContext): Promise<Response> {
	if (!API_SCHEMA_BASE_URL || !API_BASE_URL) {
		return new Response(JSON.stringify({ error: "API_SCHEMA_BASE_URL or API_BASE_URL is not set" }), {
			status: 500,
			headers: RESPONSE_HEADERS,
		});
	}

	const { params } = context;

	const schemaUrl = buildUrl(API_SCHEMA_BASE_URL, params.default ?? []);
	schemaUrl.pathname += "/index.json";
	return await handleRequest(schemaUrl, (data) => {
		return {
			body: data,
			headers: {
				'Content-Type': 'application/schema+json'
			}
		};
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