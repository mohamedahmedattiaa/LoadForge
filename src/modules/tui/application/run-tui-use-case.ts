import { ZodError } from "zod";
import type { IDiscoverCapacityUseCase } from "../../capacity/domain/capacity-port.js";
import type { IRunLoadTestUseCase } from "../../load-test/application/load-test-port.js";
import type {
    IReportRepository,
    NewSavedReportInput,
} from "../../metrics/domain/report-repository-port.js";
import type {
    IPreferencesRepository,
    ITerminalDriver,
    ITuiApp,
} from "../domain/tui-port.js";
import {
    applyCapacityLiveSnapshot,
    applyCapacityStepToLiveState,
    applyLiveLoadTestSnapshot,
    buildCapacityConfigFromForm,
    buildLoadTestConfigFromForm,
    createFormFromPreferences,
    createInitialAppState,
    createInitialLiveState,
    getSetOptionsFieldOrder,
    parseHeaderLine,
    TUI_BODY_SOURCES,
    TUI_HTTP_METHODS,
    TUI_MAIN_MENU_ITEMS,
    validateJsonBody,
} from "../domain/tui-state-service.js";
import type {
    TerminalSize,
    TuiAppState,
    TuiKeyEvent,
} from "../domain/tui-types.js";
import { renderTuiScreen } from "../presentation/tui-renderer.js";

export interface RunTuiDependencies {
    terminal: ITerminalDriver;
    runLoadTestUseCase: IRunLoadTestUseCase;
    discoverCapacityUseCase: IDiscoverCapacityUseCase;
    reportRepository: IReportRepository;
    preferencesRepository: IPreferencesRepository;
}

function formatError(error: unknown): string {
    if (error instanceof ZodError) {
        return error.issues.map((issue) => issue.message).join("; ");
    }
    if (error instanceof Error) {
        return error.message;
    }
    return "Unexpected error occurred";
}

function cycleHttpMethod(
    current: TuiAppState["form"]["method"],
    delta: number
): TuiAppState["form"]["method"] {
    const idx = TUI_HTTP_METHODS.indexOf(current);
    return TUI_HTTP_METHODS[
        (idx + delta + TUI_HTTP_METHODS.length) % TUI_HTTP_METHODS.length
    ];
}

export class RunTuiUseCase implements ITuiApp {
    private state: TuiAppState = createInitialAppState();
    private size: TerminalSize = { columns: 100, rows: 32 };
    private activeAbortController: AbortController | null = null;
    private isBusyAsyncAction = false;
    private exitResolve: (() => void) | null = null;

    constructor(private readonly deps: RunTuiDependencies) {}

    async start(): Promise<void> {
        if (!this.deps.terminal.isInteractive()) {
            console.error(
                'LoadForge interactive TUI requires a terminal (TTY). Run "loadforge --help" or use "loadforge run" / "loadforge discover".'
            );
            process.exitCode = 1;
            return;
        }

        const [prefs, reports] = await Promise.all([
            this.deps.preferencesRepository.load(),
            this.deps.reportRepository.list().catch(() => []),
        ]);
        this.state = {
            ...createInitialAppState(prefs),
            savedReports: reports,
        };
        this.size = this.deps.terminal.getSize();

        this.deps.terminal.enterAlternateScreen();

        const stopKey = this.deps.terminal.onKey((key) => {
            void this.handleKey(key);
        });
        const stopResize = this.deps.terminal.onResize((newSize) => {
            this.size = newSize;
            this.render();
        });

        try {
            this.render();
            await new Promise<void>((resolve) => {
                this.exitResolve = resolve;
            });
        } finally {
            stopKey();
            stopResize();
            this.deps.terminal.exitAlternateScreen();
        }
    }

    private render(): void {
        const frame = renderTuiScreen(this.state, this.size);
        this.deps.terminal.writeFrame(frame);
    }

    private quit(): void {
        this.activeAbortController?.abort();
        this.exitResolve?.();
        this.exitResolve = null;
    }

    private async handleKey(key: TuiKeyEvent): Promise<void> {
        if (this.isBusyAsyncAction && this.state.screen !== "live-dashboard") {
            return;
        }

        if (key.name === "ctrl-c") {
            if (this.state.screen === "live-dashboard") {
                this.abortActiveRun();
            } else {
                this.quit();
            }
            return;
        }

        switch (this.state.screen) {
            case "main-menu":
                await this.handleMainMenuKey(key);
                break;
            case "configure-body":
                await this.handleConfigureBodyKey(key);
                break;
            case "set-options":
                await this.handleSetOptionsKey(key);
                break;
            case "live-dashboard":
                if (key.name === "escape" || key.char === "q") {
                    this.abortActiveRun();
                }
                break;
            case "results":
                await this.handleResultsKey(key);
                break;
            case "reports-history":
                this.handleReportsHistoryKey(key);
                break;
            case "configuration":
                await this.handleConfigurationKey(key);
                break;
            case "about":
                if (
                    key.name === "enter" ||
                    key.name === "escape" ||
                    key.char === "q"
                ) {
                    this.state = { ...this.state, screen: "main-menu" };
                    this.render();
                }
                break;
        }
    }

    private async activateMenuIndex(index: number): Promise<void> {
        const selected = TUI_MAIN_MENU_ITEMS[index];
        if (!selected) {
            return;
        }

        switch (selected.id) {
            case "new-load-test":
            case "capacity-discovery": {
                const kind =
                    selected.id === "capacity-discovery"
                        ? "capacity"
                        : "load-test";
                const form = createFormFromPreferences(
                    this.state.preferences,
                    kind
                );
                this.state = {
                    ...this.state,
                    screen: "set-options",
                    optionsFocusIndex: 0,
                    bodyOptionIndex: Math.max(
                        0,
                        TUI_BODY_SOURCES.indexOf(form.bodySource)
                    ),
                    isAddingHeader: false,
                    headerEditDraft: "",
                    validationError: null,
                    statusMessage: null,
                    form,
                };
                this.render();
                break;
            }
            case "previous-reports": {
                this.isBusyAsyncAction = true;
                try {
                    const reports = await this.deps.reportRepository.list();
                    this.state = {
                        ...this.state,
                        screen: "reports-history",
                        historyIndex: 0,
                        savedReports: reports,
                        statusMessage: null,
                    };
                } finally {
                    this.isBusyAsyncAction = false;
                }
                this.render();
                break;
            }
            case "configuration":
                this.state = {
                    ...this.state,
                    screen: "configuration",
                    configFocusIndex: 0,
                    statusMessage: null,
                };
                this.render();
                break;
            case "about":
                this.state = {
                    ...this.state,
                    screen: "about",
                    statusMessage: null,
                };
                this.render();
                break;
            case "exit":
                this.quit();
                break;
        }
    }

    private async handleMainMenuKey(key: TuiKeyEvent): Promise<void> {
        const count = TUI_MAIN_MENU_ITEMS.length;
        const lower = key.char?.toLowerCase();

        if (key.name === "up" || key.name === "shift-tab" || lower === "k") {
            this.state = {
                ...this.state,
                menuIndex: (this.state.menuIndex - 1 + count) % count,
                statusMessage: null,
            };
            this.render();
            return;
        }

        if (key.name === "down" || key.name === "tab" || lower === "j") {
            this.state = {
                ...this.state,
                menuIndex: (this.state.menuIndex + 1) % count,
                statusMessage: null,
            };
            this.render();
            return;
        }

        if (key.name === "left" || key.name === "right") {
            const tabs = ["details", "help", "start"] as const;
            const cur = tabs.indexOf(this.state.mainMenuTab);
            const delta = key.name === "right" ? 1 : -1;
            const nextTab = tabs[(cur + delta + tabs.length) % tabs.length];
            this.state = { ...this.state, mainMenuTab: nextTab };
            this.render();
            return;
        }

        if (key.char === "?") {
            this.state = {
                ...this.state,
                mainMenuTab:
                    this.state.mainMenuTab === "help" ? "details" : "help",
            };
            this.render();
            return;
        }

        if (key.char && key.char >= "1" && key.char <= String(count)) {
            const idx = Number(key.char) - 1;
            this.state = { ...this.state, menuIndex: idx, statusMessage: null };
            await this.activateMenuIndex(idx);
            return;
        }

        if (key.name === "escape" || lower === "q") {
            this.quit();
            return;
        }

        if (key.name === "enter" || key.name === "space") {
            await this.activateMenuIndex(this.state.menuIndex);
        }
    }

    private async handleConfigureBodyKey(key: TuiKeyEvent): Promise<void> {
        if (key.name === "escape") {
            this.state = {
                ...this.state,
                screen: "set-options",
                validationError: null,
            };
            this.render();
            return;
        }

        const hasBodyPanel = this.state.form.bodySource !== "skip";
        const moveFocus = (delta: number): void => {
            const order = hasBodyPanel ? [0, 1, 2, 3] : [0, 1, 3];
            const currentPos = Math.max(
                0,
                order.indexOf(this.state.bodyFocusIndex)
            );
            const nextPos = (currentPos + delta + order.length) % order.length;
            this.state = {
                ...this.state,
                bodyFocusIndex: order[nextPos],
                validationError: null,
            };
            this.render();
        };

        if (key.name === "tab") {
            moveFocus(1);
            return;
        }
        if (key.name === "shift-tab") {
            moveFocus(-1);
            return;
        }

        const focus = this.state.bodyFocusIndex;

        if (focus === 0) {
            if (key.name === "left" || key.name === "right") {
                const nextMethod = cycleHttpMethod(
                    this.state.form.method,
                    key.name === "right" ? 1 : -1
                );
                const nextBodySource =
                    nextMethod === "GET" || nextMethod === "HEAD"
                        ? "skip"
                        : this.state.form.bodySource === "skip"
                          ? "manual"
                          : this.state.form.bodySource;
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        method: nextMethod,
                        bodySource: nextBodySource,
                    },
                    bodyOptionIndex: Math.max(
                        0,
                        TUI_BODY_SOURCES.indexOf(nextBodySource)
                    ),
                };
                this.render();
                return;
            }

            if (key.name === "down" || key.name === "enter") {
                moveFocus(1);
            } else if (key.name === "up") {
                moveFocus(-1);
            }
            return;
        }

        if (focus === 1) {
            if (key.name === "up") {
                if (this.state.bodyOptionIndex === 0) {
                    moveFocus(-1);
                    return;
                }
                const nextOpt = this.state.bodyOptionIndex - 1;
                const nextSource = TUI_BODY_SOURCES[nextOpt];
                this.state = {
                    ...this.state,
                    bodyOptionIndex: nextOpt,
                    form: { ...this.state.form, bodySource: nextSource },
                };
                this.render();
                return;
            }

            if (key.name === "down") {
                if (this.state.bodyOptionIndex === TUI_BODY_SOURCES.length - 1) {
                    moveFocus(1);
                    return;
                }
                const nextOpt = this.state.bodyOptionIndex + 1;
                const nextSource = TUI_BODY_SOURCES[nextOpt];
                this.state = {
                    ...this.state,
                    bodyOptionIndex: nextOpt,
                    form: { ...this.state.form, bodySource: nextSource },
                };
                this.render();
                return;
            }

            if (key.name === "enter" || key.name === "space") {
                const source = TUI_BODY_SOURCES[this.state.bodyOptionIndex];
                if (source === "editor") {
                    this.isBusyAsyncAction = true;
                    try {
                        const updated = await this.deps.terminal.openInEditor(
                            this.state.form.bodyText
                        );
                        this.state = {
                            ...this.state,
                            form: {
                                ...this.state.form,
                                bodySource: "manual",
                                bodyText: updated,
                            },
                            bodyOptionIndex: 0,
                            bodyFocusIndex: 2,
                            validationError: null,
                        };
                    } catch (err) {
                        this.state = {
                            ...this.state,
                            validationError: formatError(err),
                        };
                    } finally {
                        this.isBusyAsyncAction = false;
                        this.render();
                    }
                    return;
                }

                this.state = {
                    ...this.state,
                    form: { ...this.state.form, bodySource: source },
                    bodyFocusIndex: source === "skip" ? 3 : 2,
                };
                this.render();
            }
            return;
        }

        if (focus === 2) {
            if (key.name === "up") {
                moveFocus(-1);
                return;
            }
            if (key.name === "down") {
                moveFocus(1);
                return;
            }

            if (this.state.form.bodySource === "file") {
                if (key.name === "ctrl-u" || key.name === "delete") {
                    this.state = {
                        ...this.state,
                        form: { ...this.state.form, bodyFilePath: "" },
                        validationError: null,
                    };
                    this.render();
                    return;
                }
                if (key.name === "backspace") {
                    this.state = {
                        ...this.state,
                        form: {
                            ...this.state.form,
                            bodyFilePath: this.state.form.bodyFilePath.slice(
                                0,
                                -1
                            ),
                        },
                        validationError: null,
                    };
                    this.render();
                    return;
                }
                if (key.name === "enter") {
                    this.isBusyAsyncAction = true;
                    try {
                        const content = await this.deps.terminal.readTextFile(
                            this.state.form.bodyFilePath.trim()
                        );
                        this.state = {
                            ...this.state,
                            form: {
                                ...this.state.form,
                                bodyText: content,
                                bodySource: "manual",
                            },
                            bodyOptionIndex: 0,
                            validationError: null,
                        };
                    } catch (err) {
                        this.state = {
                            ...this.state,
                            validationError: `Cannot read file: ${formatError(err)}`,
                        };
                    } finally {
                        this.isBusyAsyncAction = false;
                        this.render();
                    }
                    return;
                }
                if (key.char !== undefined) {
                    this.state = {
                        ...this.state,
                        form: {
                            ...this.state.form,
                            bodyFilePath:
                                this.state.form.bodyFilePath + key.char,
                        },
                        validationError: null,
                    };
                    this.render();
                }
                return;
            }

            if (key.name === "ctrl-u" || key.name === "delete") {
                this.state = {
                    ...this.state,
                    form: { ...this.state.form, bodyText: "" },
                };
                this.render();
                return;
            }
            if (key.name === "backspace") {
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        bodyText: this.state.form.bodyText.slice(0, -1),
                    },
                };
                this.render();
                return;
            }
            if (key.name === "enter") {
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        bodyText: `${this.state.form.bodyText}\n`,
                    },
                };
                this.render();
                return;
            }
            if (key.char !== undefined) {
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        bodyText: this.state.form.bodyText + key.char,
                    },
                };
                this.render();
            }
            return;
        }

        if (focus === 3) {
            if (key.name === "up") {
                moveFocus(-1);
                return;
            }
            if (key.name === "down") {
                moveFocus(1);
                return;
            }

            if (key.name === "enter" || key.name === "space") {
                if (
                    this.state.form.method !== "GET" &&
                    this.state.form.method !== "HEAD" &&
                    this.state.form.bodySource !== "skip"
                ) {
                    const validation = validateJsonBody(this.state.form.bodyText);
                    if (!validation.ok) {
                        this.state = {
                            ...this.state,
                            validationError: validation.message,
                        };
                        this.render();
                        return;
                    }
                }

                this.state = {
                    ...this.state,
                    screen: "set-options",
                    validationError: null,
                };
                this.render();
            }
        }
    }

    private async handleSetOptionsKey(key: TuiKeyEvent): Promise<void> {
        if (this.state.isAddingHeader) {
            if (key.name === "escape") {
                this.state = {
                    ...this.state,
                    isAddingHeader: false,
                    headerEditDraft: "",
                    validationError: null,
                };
                this.render();
                return;
            }
            if (key.name === "ctrl-u") {
                this.state = { ...this.state, headerEditDraft: "" };
                this.render();
                return;
            }
            if (key.name === "backspace") {
                this.state = {
                    ...this.state,
                    headerEditDraft: this.state.headerEditDraft.slice(0, -1),
                };
                this.render();
                return;
            }
            if (key.name === "enter") {
                const parsed = parseHeaderLine(this.state.headerEditDraft);
                if (!parsed) {
                    this.state = {
                        ...this.state,
                        validationError: 'Header must use "Key: Value" format',
                    };
                    this.render();
                    return;
                }
                this.state = {
                    ...this.state,
                    isAddingHeader: false,
                    headerEditDraft: "",
                    validationError: null,
                    form: {
                        ...this.state.form,
                        headers: [...this.state.form.headers, parsed],
                    },
                };
                this.render();
                return;
            }
            if (key.char !== undefined) {
                this.state = {
                    ...this.state,
                    headerEditDraft: this.state.headerEditDraft + key.char,
                    validationError: null,
                };
                this.render();
            }
            return;
        }

        if (key.name === "ctrl-r") {
            await this.launchExecution();
            return;
        }

        if (key.name === "escape") {
            this.state = {
                ...this.state,
                screen: "main-menu",
                validationError: null,
            };
            this.render();
            return;
        }

        const fields = getSetOptionsFieldOrder(this.state.form);
        const currentIdx = Math.min(
            this.state.optionsFocusIndex,
            fields.length - 1
        );
        const activeField = fields[currentIdx];

        if (key.name === "up" || key.name === "shift-tab") {
            this.state = {
                ...this.state,
                optionsFocusIndex:
                    (currentIdx - 1 + fields.length) % fields.length,
                validationError: null,
            };
            this.render();
            return;
        }

        if (key.name === "down" || key.name === "tab") {
            this.state = {
                ...this.state,
                optionsFocusIndex: (currentIdx + 1) % fields.length,
                validationError: null,
            };
            this.render();
            return;
        }

        if (activeField === "method") {
            if (
                key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter"
            ) {
                const delta = key.name === "left" ? -1 : 1;
                const nextMethod = cycleHttpMethod(
                    this.state.form.method,
                    delta
                );
                const nextBodySource =
                    nextMethod === "GET" || nextMethod === "HEAD"
                        ? "skip"
                        : this.state.form.bodySource === "skip"
                          ? "manual"
                          : this.state.form.bodySource;
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        method: nextMethod,
                        bodySource: nextBodySource,
                    },
                    bodyOptionIndex: Math.max(
                        0,
                        TUI_BODY_SOURCES.indexOf(nextBodySource)
                    ),
                    validationError: null,
                };
                this.render();
            }
            return;
        }

        if (activeField === "edit-body") {
            if (key.name === "enter" || key.name === "space") {
                this.state = {
                    ...this.state,
                    screen: "configure-body",
                    bodyFocusIndex: 1,
                    bodyOptionIndex: Math.max(
                        0,
                        TUI_BODY_SOURCES.indexOf(this.state.form.bodySource)
                    ),
                    validationError: null,
                };
                this.render();
            }
            return;
        }

        if (activeField === "test-kind") {
            if (
                key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter"
            ) {
                const nextForm = {
                    ...this.state.form,
                    testKind:
                        this.state.form.testKind === "load-test"
                            ? ("capacity" as const)
                            : ("load-test" as const),
                };
                const nextFields = getSetOptionsFieldOrder(nextForm);
                this.state = {
                    ...this.state,
                    form: nextForm,
                    optionsFocusIndex: Math.max(0, nextFields.indexOf("test-kind")),
                    validationError: null,
                };
                this.render();
            }
            return;
        }

        if (activeField === "stop-condition") {
            if (
                key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter"
            ) {
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        stopCondition:
                            this.state.form.stopCondition === "requests"
                                ? "duration"
                                : "requests",
                    },
                };
                this.render();
            }
            return;
        }

        if (activeField === "capacity-mode") {
            if (
                key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter"
            ) {
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        capacityMode:
                            this.state.form.capacityMode === "sustained"
                                ? "burst"
                                : "sustained",
                    },
                };
                this.render();
            }
            return;
        }

        if (activeField === "until-limit") {
            if (
                key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter"
            ) {
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        untilLimit: !this.state.form.untilLimit,
                    },
                };
                this.render();
            }
            return;
        }

        if (activeField === "add-header") {
            if (key.name === "enter" || key.name === "space") {
                this.state = {
                    ...this.state,
                    isAddingHeader: true,
                    headerEditDraft: "",
                    validationError: null,
                };
                this.render();
                return;
            }
            if (
                (key.name === "backspace" ||
                    key.name === "delete" ||
                    key.name === "ctrl-u") &&
                this.state.form.headers.length > 0
            ) {
                this.state = {
                    ...this.state,
                    form: {
                        ...this.state.form,
                        headers:
                            key.name === "ctrl-u"
                                ? []
                                : this.state.form.headers.slice(0, -1),
                    },
                };
                this.render();
            }
            return;
        }

        if (activeField === "start-test") {
            if (key.name === "enter" || key.name === "space") {
                await this.launchExecution();
            }
            return;
        }

        const textFieldMap = {
            url: "url",
            requests: "requests",
            duration: "duration",
            concurrency: "concurrency",
            timeout: "timeout",
            "capacity-window": "capacityWindowSeconds",
            "start-concurrency": "startConcurrency",
            "max-concurrency": "maxConcurrency",
            "max-p95": "maxP95Ms",
        } as const;

        if (!(activeField in textFieldMap)) {
            return;
        }
        const prop = textFieldMap[activeField as keyof typeof textFieldMap];
        const currentVal = this.state.form[prop];

        if (key.name === "ctrl-u" || key.name === "delete") {
            this.state = {
                ...this.state,
                form: {
                    ...this.state.form,
                    [prop]: "",
                    ...(prop === "url" ? { urlPristine: false } : {}),
                },
                validationError: null,
            };
            this.render();
            return;
        }

        if (key.name === "backspace") {
            this.state = {
                ...this.state,
                form: {
                    ...this.state.form,
                    [prop]: currentVal.slice(0, -1),
                    ...(prop === "url" ? { urlPristine: false } : {}),
                },
                validationError: null,
            };
            this.render();
            return;
        }

        if (key.name === "enter") {
            this.state = {
                ...this.state,
                optionsFocusIndex: (currentIdx + 1) % fields.length,
            };
            this.render();
            return;
        }

        if (key.char !== undefined) {
            const base =
                prop === "url" && this.state.form.urlPristine ? "" : currentVal;
            this.state = {
                ...this.state,
                form: {
                    ...this.state.form,
                    [prop]: base + key.char,
                    ...(prop === "url" ? { urlPristine: false } : {}),
                },
                validationError: null,
            };
            this.render();
        }
    }

    private abortActiveRun(): void {
        if (
            !this.activeAbortController ||
            this.activeAbortController.signal.aborted
        ) {
            return;
        }
        this.activeAbortController.abort();
        if (this.state.live) {
            this.state = {
                ...this.state,
                live: { ...this.state.live, aborted: true },
            };
            this.render();
        }
    }

    private async launchExecution(): Promise<void> {
        const abortController = new AbortController();
        this.activeAbortController = abortController;

        try {
            let newRecord: NewSavedReportInput;

            if (this.state.form.testKind === "capacity") {
                const config = buildCapacityConfigFromForm(this.state.form);
                this.state = {
                    ...this.state,
                    screen: "live-dashboard",
                    validationError: null,
                    live: createInitialLiveState("capacity"),
                };
                this.isBusyAsyncAction = true;
                this.render();

                const report = await this.deps.discoverCapacityUseCase.execute(
                    config,
                    (step) => {
                        if (!this.state.live) return;
                        this.state = {
                            ...this.state,
                            live: applyCapacityStepToLiveState(
                                this.state.live,
                                step
                            ),
                        };
                        this.render();
                    },
                    abortController.signal,
                    (snapshot) => {
                        if (!this.state.live) return;
                        this.state = {
                            ...this.state,
                            live: applyCapacityLiveSnapshot(
                                this.state.live,
                                snapshot
                            ),
                        };
                        this.render();
                    }
                );

                newRecord = {
                    kind: "capacity",
                    targetUrl: config.url,
                    method: config.method,
                    report,
                };
            } else {
                const config = buildLoadTestConfigFromForm(this.state.form);
                this.state = {
                    ...this.state,
                    screen: "live-dashboard",
                    validationError: null,
                    live: createInitialLiveState("load-test"),
                };
                this.isBusyAsyncAction = true;
                this.render();

                const report = await this.deps.runLoadTestUseCase.execute(
                    config,
                    {
                        signal: abortController.signal,
                        progressIntervalMs: 200,
                        onProgress: (snapshot) => {
                            if (!this.state.live) return;
                            this.state = {
                                ...this.state,
                                live: applyLiveLoadTestSnapshot(
                                    this.state.live,
                                    snapshot
                                ),
                            };
                            this.render();
                        },
                    }
                );

                newRecord = {
                    kind: "load-test",
                    targetUrl: config.url,
                    method: config.method,
                    report,
                };
            }

            let filePath: string | null = null;
            let savedRecord = {
                id: "unsaved",
                createdAt: new Date().toISOString(),
                ...newRecord,
            };

            if (this.state.preferences.autoSaveReports) {
                const stored = await this.deps.reportRepository.save(newRecord);
                filePath = stored.filePath;
                savedRecord = stored.record;
            }

            this.state = {
                ...this.state,
                screen: "results",
                results: {
                    filePath,
                    record: savedRecord,
                    fromHistory: false,
                    aborted: abortController.signal.aborted,
                },
            };
        } catch (error) {
            this.state = {
                ...this.state,
                screen: "set-options",
                validationError: formatError(error),
            };
        } finally {
            this.isBusyAsyncAction = false;
            this.activeAbortController = null;
            this.render();
        }
    }

    private async handleResultsKey(key: TuiKeyEvent): Promise<void> {
        const fromHistory = this.state.results?.fromHistory ?? false;
        const lower = key.char?.toLowerCase();

        if (key.name === "enter" || key.name === "escape") {
            this.state = {
                ...this.state,
                screen: fromHistory ? "reports-history" : "main-menu",
            };
            this.render();
            return;
        }

        if (!fromHistory && lower === "r") {
            await this.launchExecution();
            return;
        }

        if (!fromHistory && lower === "n") {
            this.state = {
                ...this.state,
                screen: "set-options",
                optionsFocusIndex: 0,
                validationError: null,
            };
            this.render();
        }
    }

    private handleReportsHistoryKey(key: TuiKeyEvent): void {
        const lower = key.char?.toLowerCase();
        if (key.name === "escape" || lower === "q") {
            this.state = { ...this.state, screen: "main-menu" };
            this.render();
            return;
        }

        const total = this.state.savedReports.length;
        if (total === 0) {
            return;
        }

        if (key.name === "up" || lower === "k") {
            this.state = {
                ...this.state,
                historyIndex: (this.state.historyIndex - 1 + total) % total,
            };
            this.render();
            return;
        }

        if (key.name === "down" || lower === "j") {
            this.state = {
                ...this.state,
                historyIndex: (this.state.historyIndex + 1) % total,
            };
            this.render();
            return;
        }

        if (key.name === "enter" || key.name === "space") {
            const selected = this.state.savedReports[this.state.historyIndex];
            this.state = {
                ...this.state,
                screen: "results",
                results: {
                    filePath: selected.filePath,
                    record: selected.record,
                    fromHistory: true,
                    aborted: false,
                },
            };
            this.render();
        }
    }

    private async handleConfigurationKey(key: TuiKeyEvent): Promise<void> {
        if (key.name === "escape") {
            const fresh = await this.deps.preferencesRepository.load();
            this.state = {
                ...this.state,
                preferences: fresh,
                screen: "main-menu",
            };
            this.render();
            return;
        }

        const totalRows = 7;
        const idx = this.state.configFocusIndex;

        if (key.name === "up" || key.name === "shift-tab") {
            this.state = {
                ...this.state,
                configFocusIndex: (idx - 1 + totalRows) % totalRows,
            };
            this.render();
            return;
        }

        if (key.name === "down" || key.name === "tab") {
            this.state = {
                ...this.state,
                configFocusIndex: (idx + 1) % totalRows,
            };
            this.render();
            return;
        }

        const prefs = this.state.preferences;

        if (
            idx === 0 &&
            (key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter")
        ) {
            const nextMethod = cycleHttpMethod(
                prefs.defaultMethod,
                key.name === "left" ? -1 : 1
            );
            this.state = {
                ...this.state,
                preferences: { ...prefs, defaultMethod: nextMethod },
            };
            this.render();
            return;
        }

        if (
            idx === 4 &&
            (key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter")
        ) {
            this.state = {
                ...this.state,
                preferences: {
                    ...prefs,
                    defaultCapacityMode:
                        prefs.defaultCapacityMode === "sustained"
                            ? "burst"
                            : "sustained",
                },
            };
            this.render();
            return;
        }

        if (
            idx === 5 &&
            (key.name === "left" ||
                key.name === "right" ||
                key.name === "space" ||
                key.name === "enter")
        ) {
            this.state = {
                ...this.state,
                preferences: { ...prefs, autoSaveReports: !prefs.autoSaveReports },
            };
            this.render();
            return;
        }

        if (idx === 6 && (key.name === "enter" || key.name === "space")) {
            await this.deps.preferencesRepository.save(prefs);
            this.state = {
                ...this.state,
                screen: "main-menu",
                statusMessage: "Configuration preferences saved.",
            };
            this.render();
            return;
        }

        const textPropMap: Partial<
            Record<
                number,
                "defaultConcurrency" | "defaultTimeout" | "defaultWindowSeconds"
            >
        > = {
            1: "defaultConcurrency",
            2: "defaultTimeout",
            3: "defaultWindowSeconds",
        };
        const prop = textPropMap[idx];
        if (!prop) {
            return;
        }

        const currentVal = prefs[prop];
        if (key.name === "ctrl-u" || key.name === "delete") {
            this.state = {
                ...this.state,
                preferences: { ...prefs, [prop]: "" },
            };
            this.render();
        } else if (key.name === "backspace") {
            this.state = {
                ...this.state,
                preferences: { ...prefs, [prop]: currentVal.slice(0, -1) },
            };
            this.render();
        } else if (key.name === "enter") {
            this.state = {
                ...this.state,
                configFocusIndex: (idx + 1) % totalRows,
            };
            this.render();
        } else if (key.char !== undefined) {
            this.state = {
                ...this.state,
                preferences: { ...prefs, [prop]: currentVal + key.char },
            };
            this.render();
        }
    }
}
