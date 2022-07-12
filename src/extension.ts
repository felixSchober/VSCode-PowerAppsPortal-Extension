import * as vscode from "vscode";

import { ConfigurationManager, getConsent } from "./configuration/configurationManager";
import { PowerAppsPortalDocumentContentProvider } from "./scm/portalDocumentsContentProvider";
import { POWERAPPSPORTAL_SCHEME } from "./scm/portalRepository";
import { PowerAppsPortalSourceControl } from "./scm/portalSourceControl";
import { RepositoryPick } from "./scm/repositoryPick";
import { DialogReporter } from "./telemetry/DialogReporter";
import { Utils } from "./utils";

let portalDocumentContentProvider: PowerAppsPortalDocumentContentProvider;
const portalSourceControlRegister = new Map<vscode.Uri, PowerAppsPortalSourceControl>();

export async function activate(context: vscode.ExtensionContext) {
    // check if workspace folder is opened
    let workspaceFolder: vscode.WorkspaceFolder;
    workspaceFolder = await getWorkspaceFolder();

    // initialize configuration manager
    const configurationManager = new ConfigurationManager(workspaceFolder);
    portalDocumentContentProvider = new PowerAppsPortalDocumentContentProvider(workspaceFolder);

    // Register commands and other interfaces
    register(configurationManager, workspaceFolder, context);

    // try to start extension from existing configuration
    await initializeFolderFromConfiguration(configurationManager, workspaceFolder, context);
}

// this method is called when your extension is deactivated
export function deactivate() {}

function register(configurationManager: ConfigurationManager, workspaceFolder: vscode.WorkspaceFolder, context: vscode.ExtensionContext) {
    console.log("[START] Registering commands");
    const configureExtensionCommand = vscode.commands.registerCommand("powerapps-portal-local-development.configureExtension", async () => {
        console.log("[START] Configure command executed.");
        if (!workspaceFolder) {
            workspaceFolder = await getWorkspaceFolder();
        }
        await configureExtension(configurationManager, workspaceFolder, context, true);
    });
    context.subscriptions.push(configureExtensionCommand);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "powerapps-portal-local-development.source-control.refresh",
            async (sourceControlPane: vscode.SourceControl) => commandRefresh(sourceControlPane)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "powerapps-portal-local-development.source-control.discard",
            async (sourceControlPane: vscode.SourceControl) => commandDiscard(sourceControlPane)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "powerapps-portal-local-development.source-control.commit",
            async (sourceControlPane: vscode.SourceControl) => commandCommit(sourceControlPane)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "powerapps-portal-local-development.source-control.checkout",
            async (sourceControl: PowerAppsPortalSourceControl) => commandCheckout(sourceControl)
        )
    );

    console.log("[START] Initializing portal document content provider");
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(POWERAPPSPORTAL_SCHEME, portalDocumentContentProvider));

    console.log("[START] Initializing workspace folder event listener");
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(e => {
            try {
                console.log("[START] Workspace folder changed");
                // initialize new source control for manually added workspace folders
                e.added.forEach(wf => {
                    void initializeFolderFromConfiguration(configurationManager, wf, context);
                });
            } catch (error) {
                void DialogReporter.reportError(error);
            } finally {
                // dispose source control for removed workspace folders
                e.removed.forEach(wf => {
                    unregisterPortalSourceControl(wf.uri);
                });
            }
        })
    );
}

async function commandRefresh(sourceControlPane: vscode.SourceControl) {
    const sourceControl = await pickSourceControl(sourceControlPane);
    if (sourceControl) {
        await sourceControl.refresh(false);
    } else {
        await DialogReporter.reportError("", "Could not get source control window. Please check if the extension is configured correctly.");
    }
}

async function commandCheckout(sourceControl: PowerAppsPortalSourceControl) {
    const consent = await getConsent("Are you sure you want to replace all local files with remote portal data?");
    if (!consent) {
        return;
    }

    sourceControl = sourceControl || (await pickSourceControl(null));
    if (sourceControl) {
        await sourceControl.tryCheckout();
    }
}

async function commandDiscard(sourceControlPane: vscode.SourceControl) {
    const consent = await getConsent("Are you sure you want to replace all local files with remote portal data?");
    if (!consent) {
        return;
    }

    const sourceControl = await pickSourceControl(sourceControlPane);
    if (sourceControl) {
        await sourceControl.resetFilesToCheckedOutVersion();
    }
}

async function commandCommit(sourceControlPane: vscode.SourceControl) {
    const consent = await getConsent(
        "Commit local data to portal? There will be no merge. Files will be overwritten with local state.",
        "hideCommitWarning"
    );
    if (!consent) {
        return;
    }

    const sourceControl = await pickSourceControl(sourceControlPane);
    if (sourceControl) {
        await sourceControl.commitAll();
    } else {
        await DialogReporter.reportError(
            "",
            "Something really strange has happened - The source control pane went missing. Can you try to restart VsCode?"
        );
    }
}

async function pickSourceControl(sourceControlPane: vscode.SourceControl | null): Promise<PowerAppsPortalSourceControl | undefined> {
    if (sourceControlPane && sourceControlPane !== null) {
        if (!sourceControlPane.rootUri) {
            // get first source control panel
            for (const portalScm of portalSourceControlRegister.values()) {
                return portalScm;
            }
            return;
        }
        return portalSourceControlRegister.get(sourceControlPane.rootUri);
    }

    // todo: when/if the SourceControl exposes a 'selected' property, use that instead

    if (portalSourceControlRegister.size === 0) {
        return undefined;
    } else if (portalSourceControlRegister.size === 1) {
        return [...portalSourceControlRegister.values()][0];
    } else {
        const picks = [...portalSourceControlRegister.values()].map(fsc => new RepositoryPick(fsc));

        if (vscode.window.activeTextEditor) {
            const activeWorkspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
            const activeSourceControl = activeWorkspaceFolder && portalSourceControlRegister.get(activeWorkspaceFolder.uri);
            const activeIndex = Utils.firstIndex(picks, pick => pick.fiddleSourceControl === activeSourceControl);

            // if there is an active editor, move its folder to be the first in the pick list
            if (activeIndex > -1) {
                picks.unshift(...picks.splice(activeIndex, 1));
            }
        }

        const pick = await vscode.window.showQuickPick(picks, { placeHolder: "Select repository" });
        return pick && pick.fiddleSourceControl;
    }
}

async function initializeFolderFromConfiguration(
    configurationManager: ConfigurationManager,
    workspaceFolder: vscode.WorkspaceFolder,
    context: vscode.ExtensionContext
): Promise<void> {
    console.log("[START] Try initializing folder from configuration");

    try {
        await configurationManager.load(context, false);
    } catch (error) {
        await DialogReporter.reportError(
            error,
            "Could not load configuration. Please try running the command >Power Pages: Configure again."
        );
        return;
    }

    console.log(
        `[START] Configuration\n\tInstance Status: ${configurationManager.isConfigured ? "Loaded" : "Not loaded"}\n\tPortal Status: ${
            configurationManager.isPortalDataConfigured ? "Loaded" : "Not loaded"
        }`
    );
    if (!configurationManager.isConfigured || !configurationManager.isPortalDataConfigured) {
        console.log("[START] Could not load config. Manual config required.");
        await DialogReporter.reportError(
            "",
            "Could not load configuration. Please try to restart VSCode and run the command >Power Pages: Configure again."
        );
        return;
    }

    let portalScm: PowerAppsPortalSourceControl;
    try {
        portalScm = await PowerAppsPortalSourceControl.getPortalScm(context, workspaceFolder, configurationManager, false);
    } catch (error) {
        await DialogReporter.reportError(error);
        return;
    }
    registerPowerAppsPortalSourceControl(portalScm, context);
    portalScm.initializePeriodicFetch();
}

function registerPowerAppsPortalSourceControl(powerappsSourceControl: PowerAppsPortalSourceControl, context: vscode.ExtensionContext) {
    // update the portal document content provider with the latest content
    portalDocumentContentProvider.updated(powerappsSourceControl.getPortalData(), powerappsSourceControl.useFoldersForWebFiles);

    // every time the repository is updated with new portalData version, notify the content provider
    powerappsSourceControl.onRepositoryChange(portalData =>
        portalDocumentContentProvider.updated(portalData, powerappsSourceControl.useFoldersForWebFiles)
    );

    if (portalSourceControlRegister.has(powerappsSourceControl.getWorkspaceFolder().uri)) {
        // the folder was already under source control
        const previousSourceControl = portalSourceControlRegister.get(powerappsSourceControl.getWorkspaceFolder().uri)!;
        previousSourceControl.dispose();
    }

    portalSourceControlRegister.set(powerappsSourceControl.getWorkspaceFolder().uri, powerappsSourceControl);

    context.subscriptions.push(powerappsSourceControl);
}

function unregisterPortalSourceControl(folderUri: vscode.Uri): void {
    if (portalSourceControlRegister.has(folderUri)) {
        const previousSourceControl = portalSourceControlRegister.get(folderUri)!;
        previousSourceControl.dispose();

        portalSourceControlRegister.delete(folderUri);
    }
}

async function configureExtension(
    configurationManager: ConfigurationManager,
    workspaceFolder: vscode.WorkspaceFolder,
    context: vscode.ExtensionContext,
    triggedFromConfigureCommand: boolean
) {
    try {
        await configurationManager.load(context, triggedFromConfigureCommand);
    } catch (error) {
        await DialogReporter.reportError(error, "Could not load configuration. Please try again.");
    }

    if (configurationManager.isConfigured) {
        console.log("[START] Configuration successfully loaded.");
    } else {
        await DialogReporter.reportError("", "Could not load configuration. Please try again.");
    }

    // only overwrite data if new instance which hasn't been configured before
    const overwriteData = !configurationManager.isPortalDataConfigured;

    // register source control
    let portalScm: PowerAppsPortalSourceControl;
    try {
        portalScm = await PowerAppsPortalSourceControl.getPortalScm(context, workspaceFolder, configurationManager, overwriteData);
    } catch (error) {
        await DialogReporter.reportError(error);
        return;
    }

    registerPowerAppsPortalSourceControl(portalScm, context);

    // show the file explorer
    await vscode.commands.executeCommand("workbench.view.explorer");
}

async function getWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
    const ws = vscode.workspace.workspaceFolders || [];
    if (ws.length === 0) {
        await chooseWorkspaceFolder();
        console.log(vscode.workspace.workspaceFolders?.length);
    }
    return ws[0];
}

async function chooseWorkspaceFolder() {
    const openNewWindowOptions = ["Open in current window", "Open new window"];
    const openNewFolder = await vscode.window.showQuickPick(openNewWindowOptions, {
        placeHolder: "Open folder in current window or a new window?",
        ignoreFocusOut: true,
    });
    const useSameWindow = openNewFolder === openNewWindowOptions[0];

    const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: "Select folder location",
    });

    if (!folders || folders.length === 0) {
        await vscode.window.showErrorMessage("Please pick a folder");
        return;
    }
}

