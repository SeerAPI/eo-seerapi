import {
  API_BASE_URL,
  RESPONSE_HEADERS,
  type EventContext,
  handlePathParam,
  createNotFoundResponse,
  createRawJsonResponse,
} from "../_common.js";
import { getData } from "../_data.js";

export async function onRequestGet(context: EventContext): Promise<Response> {
  if (!API_BASE_URL) {
    return new Response(JSON.stringify({ error: "API_BASE_URL is not set" }), {
      status: 500,
      headers: RESPONSE_HEADERS,
    });
  }

  const { params } = context;
  const paths = handlePathParam(params.default);
  const fullPath = [...paths, "index.json"];
  const raw =
    (await getData(`schemas/${fullPath.join("/")}`, { type: "text" })) ??
    (await getData(`schemas/${paths.join("/") + ".json"}`, { type: "text" }));

  if (!raw) {
    return createNotFoundResponse();
  }
  return createRawJsonResponse(raw, 200, "OK", {
    "Content-Type": "application/schema+json",
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
