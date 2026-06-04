import { getStore } from "@edgeone/pages-blob";
import { type EventContext } from "../v1/_common.js";

export default async function onRequestGet(context: EventContext): Promise<Response> {
    const store = getStore("test-store");
    const data = await store.get("data/skill/id.json", { type: "json" });
    const { request, params } = context;
    const url = new URL(request.url, API_BASE_URL);

    return new Response(data[String(params.default[0])], {
        headers: {
            "Content-Type": "application/json",
        },
    });
}