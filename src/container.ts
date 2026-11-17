import { DiscoverCapacityUseCase } from "./modules/capacity/application/discover-capacity-use-case.js";
import type {
    ICapacityReportFormatter,
    IDiscoverCapacityUseCase,
} from "./modules/capacity/domain/capacity-port.js";
import { ConsoleCapacityFormatter } from "./modules/capacity/presentation/console-capacity-formatter.js";
import { ConcurrencyControllerFactory } from "./modules/concurrency/domain/adaptive-concurrency-service.js";
import { WorkerPoolFactory } from "./modules/concurrency/infrastructure/worker-pool.js";
import { FetchHttpClient } from "./modules/http/infrastructure/fetch-http-client.js";
import { AdaptiveTimeoutEstimator } from "./modules/load-test/application/adaptive-timeout-estimator.js";
import type { IRunLoadTestUseCase } from "./modules/load-test/application/load-test-port.js";
import { RunLoadTestUseCase } from "./modules/load-test/application/run-load-test-use-case.js";
import type { IReportFormatter } from "./modules/metrics/domain/metrics-port.js";
import type { IReportRepository } from "./modules/metrics/domain/report-repository-port.js";
import { MetricsCollectorFactory } from "./modules/metrics/domain/metrics-collector-service.js";
import { ReportBuilder } from "./modules/metrics/domain/report-builder-service.js";
import { FileReportRepository } from "./modules/metrics/infrastructure/file-report-repository.js";
import { ConsoleReportFormatter } from "./modules/metrics/presentation/console-report-formatter.js";
import { RunTuiUseCase } from "./modules/tui/application/run-tui-use-case.js";
import type { ITuiApp } from "./modules/tui/domain/tui-port.js";
import { AnsiTerminalDriver } from "./modules/tui/infrastructure/ansi-terminal-driver.js";
import { FilePreferencesRepository } from "./modules/tui/infrastructure/file-preferences-repository.js";

export interface AppContainer {
    runLoadTestUseCase: IRunLoadTestUseCase;
    reportFormatter: IReportFormatter;
    discoverCapacityUseCase: IDiscoverCapacityUseCase;
    capacityFormatter: ICapacityReportFormatter;
    reportRepository: IReportRepository;
    tuiApp: ITuiApp;
}

/**
 * Composition Root (DI Container):
 * Wires concrete Infrastructure adapters, Domain Services, and Presentation formatters
 * into Application Use Cases.
 */
export function createAppContainer(): AppContainer {
    const transport = new FetchHttpClient();
    const workerPoolFactory = new WorkerPoolFactory();
    const metricsCollectorFactory = new MetricsCollectorFactory();
    const reportBuilder = new ReportBuilder();
    const timeoutEstimator = new AdaptiveTimeoutEstimator(transport);
    const concurrencyControllerFactory = new ConcurrencyControllerFactory();
    const reportFormatter = new ConsoleReportFormatter();
    const capacityFormatter = new ConsoleCapacityFormatter();
    const reportRepository = new FileReportRepository();
    const preferencesRepository = new FilePreferencesRepository();
    const terminal = new AnsiTerminalDriver();

    const runLoadTestUseCase = new RunLoadTestUseCase({
        transport,
        workerPoolFactory,
        metricsCollectorFactory,
        reportBuilder,
        timeoutEstimator,
        concurrencyControllerFactory,
    });

    const discoverCapacityUseCase = new DiscoverCapacityUseCase({
        runLoadTestUseCase,
        timeoutEstimator,
    });

    const tuiApp = new RunTuiUseCase({
        terminal,
        runLoadTestUseCase,
        discoverCapacityUseCase,
        reportRepository,
        preferencesRepository,
    });

    return {
        runLoadTestUseCase,
        reportFormatter,
        discoverCapacityUseCase,
        capacityFormatter,
        reportRepository,
        tuiApp,
    };
}
