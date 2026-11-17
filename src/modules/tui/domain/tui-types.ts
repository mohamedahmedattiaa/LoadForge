import type {
    CapacityDiscoveryMode,
    CapacityStepResult,
} from "../../capacity/domain/capacity-types.js";
import type { HttpMethod } from "../../http/domain/http-types.js";
import type {
    SavedReportRecord,
    StoredReportEntry,
} from "../../metrics/domain/report-repository-port.js";

export type TuiScreenId =
    | "main-menu"
    | "configure-body"
    | "set-options"
    | "live-dashboard"
    | "results"
    | "reports-history"
    | "configuration"
    | "about";

export type TuiMainMenuTab = "details" | "help" | "start";

export type TuiTestKind = "load-test" | "capacity";
export type TuiStopCondition = "requests" | "duration";
export type TuiBodySource = "manual" | "file" | "editor" | "skip";

export interface TuiHeaderEntry {
    key: string;
    value: string;
}

export interface TuiPreferences {
    defaultMethod: HttpMethod;
    defaultConcurrency: string;
    defaultTimeout: string;
    defaultWindowSeconds: string;
    defaultCapacityMode: CapacityDiscoveryMode;
    autoSaveReports: boolean;
}

export interface TuiFormState {
    testKind: TuiTestKind;
    method: HttpMethod;
    bodySource: TuiBodySource;
    bodyText: string;
    bodyFilePath: string;
    url: string;
    urlPristine: boolean;
    stopCondition: TuiStopCondition;
    requests: string;
    duration: string;
    concurrency: string;
    timeout: string;
    headers: TuiHeaderEntry[];
    capacityMode: CapacityDiscoveryMode;
    capacityWindowSeconds: string;
    startConcurrency: string;
    maxConcurrency: string;
    untilLimit: boolean;
    maxP95Ms: string;
}

export interface TuiLiveState {
    startedAtMs: number;
    phase: "probing_timeout" | "running" | "completing" | "discovering";
    elapsedMs: number;
    targetDurationMs?: number;
    targetRequests?: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    instantRps: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    errorRate: number;
    currentConcurrency: number;
    resolvedTimeoutMs: number;
    historyRps: number[];
    historyAvgLatency: number[];
    historyP95Latency: number[];
    historyErrorRate: number[];
    capacitySteps: CapacityStepResult[];
    stepBaseRequests: number;
    stepBaseSuccess: number;
    stepBaseFailed: number;
    stepHasLiveSamples: boolean;
    aborted: boolean;
}

export interface TuiResultsState {
    filePath: string | null;
    record: SavedReportRecord;
    fromHistory: boolean;
    aborted: boolean;
}

export interface TuiKeyEvent {
    name:
        | "up"
        | "down"
        | "left"
        | "right"
        | "enter"
        | "escape"
        | "tab"
        | "shift-tab"
        | "backspace"
        | "delete"
        | "home"
        | "end"
        | "space"
        | "ctrl-c"
        | "ctrl-u"
        | "ctrl-r"
        | "char";
    char?: string;
}

export interface TerminalSize {
    columns: number;
    rows: number;
}

export interface TuiAppState {
    screen: TuiScreenId;
    menuIndex: number;
    mainMenuTab: TuiMainMenuTab;
    bodyFocusIndex: number;
    bodyOptionIndex: number;
    optionsFocusIndex: number;
    headerEditDraft: string;
    isAddingHeader: boolean;
    historyIndex: number;
    configFocusIndex: number;
    validationError: string | null;
    statusMessage: string | null;
    preferences: TuiPreferences;
    form: TuiFormState;
    live: TuiLiveState | null;
    results: TuiResultsState | null;
    savedReports: StoredReportEntry[];
}
