import { ExtensionContext, workspace, WorkspaceFolder } from 'vscode';
import { IPortalConfigurationFile } from '../models/interfaces/portalConfigurationFile';
import { CredentialManager } from './credentialManager';
import { multiStepInput } from './quickInputConfigurator';
import * as afs from '../scm/afs';
import path = require('path');


export const PORTAL_CONFIGURATION_FILE = ".portal";

export class ConfigurationManager {

	d365InstanceName: string | undefined;
	d365CrmRegion: string | undefined;
	credentialManager: CredentialManager | undefined;
	portalId: string | undefined;
	portalName: string | undefined;

	constructor(private readonly workspaceFolder: WorkspaceFolder) {
	}

	get isConfigured(): boolean {
		if (this.d365InstanceName && this.d365CrmRegion && this.credentialManager?.isConfigured) {
			return true;
		}
		return false;
	}

	get isPortalDataConfigured(): boolean {
		if (this.portalId && this.portalName) {
			return true;
		}
		return false;
	}

	public async load(context: ExtensionContext) {
		// either the values can be loaded from a configuration file or the configuration quickInput has to be used
		try {
			await this.loadConfiguration();
		} catch (error) {
			console.log('[CONFIG] Could not get pre existing configuration from config store. Getting new values. Error: ' + error);
		}

		if (this.isConfigured) {
			console.log('[CONFIG] Configuration successfully loaded from local store.');
			return;
		}

		await this.configure(context);
	}

	private async loadConfiguration() {

		let aadClientId: string | undefined;
		let aadTenantId: string | undefined; 
		try {
			const configuration = workspace.getConfiguration('powerappsPortals');
			this.d365InstanceName = configuration.get<string>('dynamicsInstanceName');
			this.d365CrmRegion = configuration.get<string>('dynamicsCrmRegion');

			aadClientId = configuration.get<string>('aadClientId');
			aadTenantId = configuration.get<string>('aadTenantId');

			if (!aadClientId || !aadTenantId) {
				throw Error('[CONFIG] Could not load either client id or tenant id from local config store.');
			}

			this.credentialManager = new CredentialManager(aadTenantId, aadClientId);
		} catch (error) {
			throw Error('[CONFIG] Could not load configuration form config file: ' + error);
		}
		
		await this.credentialManager.loadCredentials();

		// try to also get the portal instance config from the configuration file
		await this.loadPortalConfigurationFile();
	}

	private async loadPortalConfigurationFile() {
		// Loads the portal configuration file that contains the id and name
		const configFilePath = this.getConfigurationFilePath();
		const configFileExists = await afs.exists(configFilePath);

		if (configFileExists) {
			const data = await afs.readFile(configFilePath);
			const config: IPortalConfigurationFile = <IPortalConfigurationFile>JSON.parse(data.toString(afs.UTF8));
			if (!config || !config.portalId || !config.portalName) {
				console.warn(`[CONFIG] Portal config file exists but content is not valid: ${data.toString(afs.UTF8)}`);
				return;
			}

			this.portalId = config.portalId;
			this.portalName = config.portalName;

			console.log(`[CONFIG] Restored portal name and id with config file.`);
		}
	}

	private async configure(context: ExtensionContext) {
		const config = await multiStepInput(context);

		this.d365InstanceName = config.instanceName;
		
		if (typeof config.crmRegion === 'string') {
			this.d365CrmRegion = config.crmRegion;
		} else {
			this.d365CrmRegion = config.crmRegion.label;
		}

		this.credentialManager = new CredentialManager(config.aadTenantId, config.aadClientId);
		this.credentialManager.setClientSecret(config.aadClientSecret);

		await this.storeConfiguration();
	}

	private async storeConfiguration(): Promise<void> {
		if (!this.credentialManager || !this.credentialManager.isConfigured) {
			throw Error('Could not store configuration because credential manager is not initialized or not configured');
		}

		if (!this.d365InstanceName || !this.d365CrmRegion) {
			throw Error('Could not store configuration because connection values are not specified');
		}

		await workspace.getConfiguration().update('powerappsPortals.aadTenantId', this.credentialManager.aadTenantId);
		await workspace.getConfiguration().update('powerappsPortals.aadClientId', this.credentialManager.aadClientId);

		await workspace.getConfiguration().update('powerappsPortals.dynamicsInstanceName', this.d365InstanceName);
		await workspace.getConfiguration().update('powerappsPortals.dynamicsCrmRegion', this.d365CrmRegion);
	}

	async storeConfigurationFile(): Promise<void> {
		if (!this.portalId || !this.portalName) {
			console.error('Could not store configuration file because portalId or portalName are not set.');
			return;
		}

		const config: IPortalConfigurationFile = {
			portalId: this.portalId,
			portalName: this.portalName
		};
		const configString = JSON.stringify(config);
		const configFilePath = this.getConfigurationFilePath();
		console.log(`[CONFIG] Save portal config file to ${configFilePath}`);
		await afs.writeDocument(
			configFilePath,
			Buffer.from(configString, afs.UTF8)
		);
	}

	private getConfigurationFilePath(): string{
		return path.join(this.workspaceFolder.uri.fsPath, PORTAL_CONFIGURATION_FILE);
	}
}