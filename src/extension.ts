import * as vscode from 'vscode';
import { DynamicsApi } from './api/dynamicsApi';
import { Utils } from './utils';
import { ConfigurationManager } from './configuration/configurationManager';
import { PowerAppsPortalDocumentContentProvider } from './scm/portalDocumentsContentProvider';
import { PowerAppsPortalSourceControl } from './scm/portalSourceControl';
import { POWERAPPSPORTAL_SCHEME } from './scm/portalRepository';
import path = require('path');

const SOURCE_CONTROL_OPEN_COMMAND = 'extension.source-control.open';
let portalDocumentContentProvider: PowerAppsPortalDocumentContentProvider;
const portalSourceControlRegister = new Map<vscode.Uri, PowerAppsPortalSourceControl>();


export function activate(context: vscode.ExtensionContext) {

	// check if workspace folder is opened
	let workFolderPath: string;
	try {
		workFolderPath = getWorkspacePath();
	} catch (error) {
		vscode.window.showErrorMessage(`Please open a work folder first.`);
		return;
	}

	const configurationManager = new ConfigurationManager();
	portalDocumentContentProvider = new PowerAppsPortalDocumentContentProvider();

	const configureExtensionCommand = vscode.commands.registerCommand(
		'powerapps-portal-local-development.configureExtension',
		async () => {
			await configureExtension(configurationManager, workFolderPath, context);
		}
	);
	context.subscriptions.push(configureExtensionCommand);


	context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(POWERAPPSPORTAL_SCHEME, portalDocumentContentProvider));

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
		try {
			// initialize new source control for manually added workspace folders
			e.added.forEach(wf => {
				initializeFolderFromConfiguration(wf, context);
			});
		} catch (ex) {
			vscode.window.showErrorMessage(ex.message);
		} finally {
			// dispose source control for removed workspace folders
			e.removed.forEach(wf => {
				unregisterPortalSourceControl(wf.uri);
			});
		}
	}));

	// let disposable = vscode.commands.registerCommand('powerapps-portal-local-development.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed

	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from PowerApps Portal Local Development!');

	// 	const workspace = vscode.workspace;
	// 	console.log(vscode.workspace.workspaceFile);
	// });

	// context.subscriptions.push(disposable);

	// const d365SyncCommand = vscode.commands.registerCommand('powerapps-portal-local-development.syncD365Instance', async () => {
	// 	await syncFromDynamicsInstance(d365Api);
	// });

	// context.subscriptions.push(d365SyncCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {}


async function initializeFolderFromConfiguration(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext): Promise<void> {
	
	const configurationManager = new ConfigurationManager();
	await configurationManager.load(context);
	const powerappsSourceControl = new PowerAppsPortalSourceControl(context, folder, configurationManager);
	registerPowerAppsPortalSourceControl(powerappsSourceControl, context);
}

function registerPowerAppsPortalSourceControl(powerappsSourceControl: PowerAppsPortalSourceControl, context: vscode.ExtensionContext) {
	// update the fiddle document content provider with the latest content
	portalDocumentContentProvider.updated(powerappsSourceControl.getFiddle());

	// every time the repository is updated with new fiddle version, notify the content provider
	powerappsSourceControl.onRepositoryChange(fiddle => portalDocumentContentProvider.updated(fiddle));

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
	workFolderPath: string,
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
}

function getWorkspacePath(): string {
	const ws = vscode.workspace.workspaceFolders || [];
	if (ws.length === 0) {
		throw new Error('There is no open folder in visual studio code.');
	}

	return ws[0].uri.fsPath;
}

async function syncFromDynamicsInstance(d365Api: DynamicsApi): Promise<void> {
	const portalId = await d365Api.getPortalId('Customer Self-Service');
	const webTemplates = await d365Api.getWebTemplates(portalId);

	vscode.window.showInformationMessage(`Found ${webTemplates.length} web templates`);
}

async function createPortalFolderStructure() {
	const wsPath = getWorkspacePath();

	const webTemplatePathName = 'Web Templates';
	const contentSnippetsPathName = 'Content Snippets';
	const assetsPathName = 'Assets';
	const imagesPathName = 'Images';
	const stylesPathName = 'Style';
	const fontsPathName = 'Fonts';
	const miscPathName = 'Misc';

	await Utils.createFolder(path.join(wsPath, webTemplatePathName));
	await Utils.createFolder(path.join(wsPath, contentSnippetsPathName));

	const assetsPath = path.join(wsPath, assetsPathName);
	await Utils.createFolder(assetsPath);
	await Utils.createFolder(path.join(assetsPath, imagesPathName));
	await Utils.createFolder(path.join(assetsPath, stylesPathName));
	await Utils.createFolder(path.join(assetsPath, fontsPathName));
	await Utils.createFolder(path.join(assetsPath, miscPathName));
}
