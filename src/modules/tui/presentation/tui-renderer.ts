import type { TerminalSize, TuiAppState } from "../domain/tui-types.js";
import { renderConfigureBodyScreen } from "./screens/configure-body-screen.js";
import { renderLiveDashboardScreen } from "./screens/live-dashboard-screen.js";
import { renderMainMenuScreen } from "./screens/main-menu-screen.js";
import { renderResultsScreen } from "./screens/results-screen.js";
import { renderSetOptionsScreen } from "./screens/set-options-screen.js";
import {
    renderAboutScreen,
    renderConfigurationScreen,
    renderReportsHistoryScreen,
} from "./screens/utility-screens.js";

export function renderTuiScreen(
    state: TuiAppState,
    size: TerminalSize
): string {
    switch (state.screen) {
        case "main-menu":
            return renderMainMenuScreen(state, size);
        case "configure-body":
            return renderConfigureBodyScreen(state, size);
        case "set-options":
            return renderSetOptionsScreen(state, size);
        case "live-dashboard":
            return renderLiveDashboardScreen(state, size);
        case "results":
            return renderResultsScreen(state, size);
        case "reports-history":
            return renderReportsHistoryScreen(state, size);
        case "configuration":
            return renderConfigurationScreen(state, size);
        case "about":
            return renderAboutScreen(state, size);
    }
}
