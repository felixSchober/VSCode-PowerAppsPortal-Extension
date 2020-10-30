import * as vscode from 'vscode';
import { DynamicsApi } from './api/dynamicsApi';
import { Utils } from './utils';
import { ConfigurationManager } from './configuration/configurationManager';
import { PowerAppsPortalDocumentContentProvider } from './scm/portalDocumentsContentProvider';
import { PowerAppsPortalSourceControl } from './scm/portalSourceControl';
import { POWERAPPSPORTAL_SCHEME } from './scm/portalRepository';

const SOURCE_CONTROL_OPEN_COMMAND = 'extension.source-control.open';
let portalDocumentContentProvider: PowerAppsPortalDocumentContentProvider;
const portalSourceControlRegister = new Map<vscode.Uri, PowerAppsPortalSourceControl>();

export async function activate(context: vscode.ExtensionContext) {
	// check if workspace folder is opened
	let workspaceFolder: vscode.WorkspaceFolder;
	try {
		workspaceFolder = getWorkspaceFolder();
	} catch (error) {
		vscode.window.showErrorMessage(`Please open a work folder first.`);
		return;
	}

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

function register(
	configurationManager: ConfigurationManager,
	workspaceFolder: vscode.WorkspaceFolder,
	context: vscode.ExtensionContext
) {
	console.log('[START] Registering commands');
	const configureExtensionCommand = vscode.commands.registerCommand(
		'powerapps-portal-local-development.configureExtension',
		async () => {
			await configureExtension(configurationManager, workspaceFolder, context);
		}
	);
	context.subscriptions.push(configureExtensionCommand);

	console.log('[START] Initializing portal document content provider');
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(POWERAPPSPORTAL_SCHEME, portalDocumentContentProvider)
	);

	console.log('[START] Initializing workspace folder event listener');
	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders((e) => {
			try {
				console.log('[START] Workspace folder changed');
				// initialize new source control for manually added workspace folders
				e.added.forEach((wf) => {
					initializeFolderFromConfiguration(configurationManager, wf, context);
				});
			} catch (ex) {
				vscode.window.showErrorMessage(ex.message);
			} finally {
				// dispose source control for removed workspace folders
				e.removed.forEach((wf) => {
					unregisterPortalSourceControl(wf.uri);
				});
			}
		})
	);
}

async function initializeFolderFromConfiguration(
	configurationManager: ConfigurationManager,
	workspaceFolder: vscode.WorkspaceFolder,
	context: vscode.ExtensionContext
): Promise<void> {
	console.log('[START] Try initializing folder from configuration');
	await configurationManager.load(context);

	console.log(
		`[START] Configuration\n\tInstance Status: ${
			configurationManager.isConfigured ? 'Loaded' : 'Not loaded'
		}\n\tPortal Status: ${configurationManager.isPortalDataConfigured ? 'Loaded' : 'Not loaded'}`
	);
	if (!configurationManager.isConfigured || !configurationManager.isPortalDataConfigured) {
		console.log('[START] Could not load config. Manual config required.');
		return;
	}

	let portalScm: PowerAppsPortalSourceControl;
	try {
		portalScm = await PowerAppsPortalSourceControl.getPortalScm(
			context,
			workspaceFolder,
			configurationManager,
			false
		);
	} catch (error) {
		vscode.window.showErrorMessage(error);
		return;
	}
	registerPowerAppsPortalSourceControl(portalScm, context);
}

function registerPowerAppsPortalSourceControl(
	powerappsSourceControl: PowerAppsPortalSourceControl,
	context: vscode.ExtensionContext
) {
	// update the portal document content provider with the latest content
	portalDocumentContentProvider.updated(powerappsSourceControl.getPortalData());

	// every time the repository is updated with new portalData version, notify the content provider
	powerappsSourceControl.onRepositoryChange((portalData) => portalDocumentContentProvider.updated(portalData));

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

async function start(
	folder: vscode.WorkspaceFolder,
	context: vscode.ExtensionContext,
	configurationManager: ConfigurationManager
) {}

async function configureExtension(
	configurationManager: ConfigurationManager,
	workspaceFolder: vscode.WorkspaceFolder,
	context: vscode.ExtensionContext
) {
	try {
		await configurationManager.load(context);
	} catch (error) {
		vscode.window.showErrorMessage('Could not load configuration. Please try again. Error: ' + error);
	}

	if (configurationManager.isConfigured) {
		vscode.window.showInformationMessage('Configuration successfully loaded.');
	} else {
		vscode.window.showErrorMessage('Could not load configuration. Please try again.');
	}

	// only overwrite data if new instance which hasn't been configured before
	const overwriteData = configurationManager.isPortalDataConfigured;

	// register source control
	let portalScm: PowerAppsPortalSourceControl;
	try {
		portalScm = await PowerAppsPortalSourceControl.getPortalScm(
			context,
			workspaceFolder,
			configurationManager,
			overwriteData
		);
	} catch (error) {
		vscode.window.showErrorMessage(error);
		return;
	}

	registerPowerAppsPortalSourceControl(portalScm, context);

	// show the file explorer with the three new files
	vscode.commands.executeCommand('workbench.view.explorer');
}

function getWorkspaceFolder(): vscode.WorkspaceFolder {
	const ws = vscode.workspace.workspaceFolders || [];
	if (ws.length === 0) {
		throw new Error('There is no open folder in visual studio code.');
	}

	return ws[0];
}
