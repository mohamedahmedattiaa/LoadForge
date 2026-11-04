import type { HttpRequest } from "./http-request.js";
import type { HttpResponse } from "./http-response.js";

export class HttpClient {
    async send(request: HttpRequest): Promise<HttpResponse> {
        const startTime = performance.now();

        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: AbortSignal.timeout(request.timeout),
        });

        if(response.body){
            for await (const chunk of response.body) {}
        }
        const duration = performance.now() - startTime;

        return {
            statusCode: response.status,
            headers: response.headers,
            duration,
        };
    }
}