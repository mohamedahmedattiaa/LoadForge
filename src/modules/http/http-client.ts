
import type { HttpRequest } from "./http-request.js";
import type { HttpResponse } from "./http-response.js";

export class HttpTimeoutError extends Error {
    constructor(options?: ErrorOptions) {
        super("HTTP request timed out", options);
        this.name = "HttpTimeoutError";
    }
}

export class HttpClient {
    async send(request: HttpRequest): Promise<HttpResponse> {
        const startedAt = performance.now();

        try {
            const response = await fetch(request.url, {
                method: request.method,
                headers: request.headers,
                body: request.body,
                signal: AbortSignal.timeout(request.timeout),
            });

            if (response.body) {
                for await (const chunk of response.body) {
                    void chunk;
                }
            }

            return {
                statusCode: response.status,
                headers: response.headers,
                duration: performance.now() - startedAt,
            };
        } catch (error) {
            if (
                error instanceof Error &&
                error.name === "TimeoutError"
            ) {
                throw new HttpTimeoutError({ cause: error });
            }

            throw error;
        }
    }
}
