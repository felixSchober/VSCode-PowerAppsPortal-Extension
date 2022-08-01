import { window } from "vscode";

export class DialogReporter {
    /**
     * Shows an error dialog to the user.
     * @param error Error to show
     * @param message Additional message to show before error message
     */
    public static async reportError(error: unknown, message?: string, showDialog: boolean = true): Promise<void> {
        const errorMessage = error instanceof Error ? error.message : `${error}`;
        const additionalMessage = message !== undefined ? message + ": " : "";
        showDialog && (await window.showErrorMessage(`${additionalMessage}${errorMessage}`));
    }
}

