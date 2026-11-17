import type {
    TerminalSize,
    TuiKeyEvent,
    TuiPreferences,
} from "./tui-types.js";

export type KeyEventHandler = (key: TuiKeyEvent) => void;
export type ResizeHandler = (size: TerminalSize) => void;

export interface ITerminalDriver {
    isInteractive(): boolean;
    getSize(): TerminalSize;
    enterAlternateScreen(): void;
    exitAlternateScreen(): void;
    writeFrame(frame: string): void;
    onKey(handler: KeyEventHandler): () => void;
    onResize(handler: ResizeHandler): () => void;
    readTextFile(filePath: string): Promise<string>;
    openInEditor(initialContent: string): Promise<string>;
}

export interface IPreferencesRepository {
    getPreferencesPath(): string;
    load(): Promise<TuiPreferences>;
    save(preferences: TuiPreferences): Promise<void>;
}

export interface ITuiApp {
    start(): Promise<void>;
}
