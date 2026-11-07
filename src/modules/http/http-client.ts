import type { HttpRequest } from "./http-request.js";
import type { HttpResponse } from "./http-response.js";
import type { ITransportClient } from "./http-client.types.js";

export class HttpTimeoutError extends Error {
    constructor(options?: ErrorOptions) {
        super("HTTP request timed out", options);
        this.name = "HttpTimeoutError";
    }
}

export class HttpNetworkError extends Error {
    constructor(options?: ErrorOptions) {
        super("HTTP network request failed", options);
        this.name = "HttpNetworkError";
    }
}

/**
 * Handles DOMException (TimeoutError, AbortError), undici ConnectTimeoutError,
 */
export function isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    if (
        error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error.name === "HttpTimeoutError"
    ) {
        return true;
    }

    const message = error.message.toLowerCase();
    if (message.includes("timeout") || message.includes("timed out") || message.includes("aborted")) {
        return true;
    }

    if ("cause" in error && error.cause instanceof Error) {
        return isTimeoutError(error.cause);
    }

    return false;
}

export class HttpClient implements ITransportClient {
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
            if (isTimeoutError(error)) {
                throw new HttpTimeoutError({ cause: error });
            }

            if (error instanceof TypeError) {
                throw new HttpNetworkError({ cause: error });
            }

            throw error;
        }
    }
}
