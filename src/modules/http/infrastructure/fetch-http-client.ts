import {
    HttpNetworkError,
    HttpTimeoutError,
    isTimeoutError,
    type HttpRequest,
    type HttpResponse,
} from "../domain/http-types.js";
import type { ITransportClient } from "../domain/transport-port.js";

export class FetchHttpClient implements ITransportClient {
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
