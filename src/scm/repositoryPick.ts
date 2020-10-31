import { PowerAppsPortalSourceControl } from "./portalSourceControl";
import * as vscode from 'vscode';

export class RepositoryPick implements vscode.QuickPickItem {

	constructor(public readonly fiddleSourceControl: PowerAppsPortalSourceControl) { }

	get label(): string {
		return this.fiddleSourceControl.getSourceControl().label;
	}
}