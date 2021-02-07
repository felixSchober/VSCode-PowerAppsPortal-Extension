import { ExtensionContext, window, workspace, WorkspaceFolder } from 'vscode';
import { IPortalConfigurationFile } from '../models/interfaces/portalConfigurationFile';
import { CredentialManager } from './credentialManager';
import { ConfigurationState, multiStepInput } from './quickInputConfigurator';
import * as afs from '../scm/afs';
import path = require('path');


export const PORTAL_CONFIGURATION_FILE = ".portal";
export const PORTAL_SETTING_PREFIX_ID = "powerappsPortals";

export class ConfigurationManager {

	d365InstanceName: string | undefined;
	d365CrmRegion: string | undefined;
	credentialManager: CredentialManager | undefined;
	portalId: string | undefined;
	portalName: string | undefined;
	defaultPageTemplate: string | undefined;
	useFoldersForWebFiles: boolean | undefined;

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

	get instanceUrl(): string {
		return `${this.d365InstanceName}.${this.d365CrmRegion}.dynamics.com`;
	}

	public async load(context: ExtensionContext, triggedFromConfigureCommand: boolean) {
		// either the values can be loaded from a configuration file or the configuration quickInput has to be used
		try {
			await this.loadConfiguration();
		} catch (error) {
			console.log('[CONFIG] Could not get pre existing configuration from config store. Getting new values. Error: ' + error);
		}


		if (this.isConfigured) {
			console.log('[CONFIG] Configuration successfully loaded from local store.');

			let reconfigureExtension: boolean | undefined;

			// only allow reconfigure if not executed by manual command
			if (triggedFromConfigureCommand) {
				let question: string;
				if (this.isPortalDataConfigured) {
					question = `Existing configuration for portal ${this.portalName} found. Replace?`;
				} else {
					question = `Existing configuration for instance ${this.d365InstanceName} found. Replace?`;
				}
	
				reconfigureExtension = await getConsent(question);
			}
			
			if (!reconfigureExtension) {
				return;
			}

			console.log('[START] Reconfigure with user consent');

			const configFilePath = this.getConfigurationFilePath();
			const configFileExists = await afs.exists(configFilePath);
			if (configFileExists) {
				console.log('[CONFIG] Delete existing portal config file');
				await afs.unlink(configFilePath);
				this.portalId = undefined;
				this.portalName = undefined;
			}
		} else {
			// application not configured.
			// only force manual configuration if triggered by command
			console.log(`[CONFIG] Not configured. Continue with manual configuration: ${triggedFromConfigureCommand}`);
			if (!triggedFromConfigureCommand) {
				return;
			}
		}

		await this.configure(context);
	}

	private async loadConfiguration() {

		let aadClientId: string | undefined;
		let aadTenantId: string | undefined; 
		try {
			const configuration = workspace.getConfiguration(PORTAL_SETTING_PREFIX_ID);
			this.d365InstanceName = configuration.get<string>('dynamicsInstanceName');
			this.d365CrmRegion = configuration.get<string>('dynamicsCrmRegion');
			this.useFoldersForWebFiles = configuration.get<boolean>('useFoldersForFiles') || false;

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
			if (!config || !config.portalId || !config.portalName || (this.useFoldersForWebFiles && !config.defaultPageTemplateId)) {
				console.warn(`[CONFIG] Portal config file exists but content is not valid: ${data.toString(afs.UTF8)}`);
				return;
			}

			this.portalId = config.portalId;
			this.portalName = config.portalName;
			this.defaultPageTemplate = config.defaultPageTemplateId;

			console.log(`[CONFIG] Restored portal name and id with config file.`);
		}
	}

	private async configure(context: ExtensionContext) {

		let config: ConfigurationState | undefined = undefined;
		try {
			config = await multiStepInput(context);
		} catch (error) {
			window.showInformationMessage('Power Apps Portal configuration canceled.');
			if (error.message === 'canceled') {
				return;
			}
			console.error('Could not get user configuration: ' + error);
		}

		if (!config) {
			window.showErrorMessage('Could not get configuration for Portal connection. Please try again.');
			return;
		}
		

		this.d365InstanceName = config.instanceName;
		this.useFoldersForWebFiles = config.useFoldersForFiles;
		
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

		await workspace.getConfiguration().update(PORTAL_SETTING_PREFIX_ID + '.aadTenantId', this.credentialManager.aadTenantId);
		await workspace.getConfiguration().update(PORTAL_SETTING_PREFIX_ID + '.aadClientId', this.credentialManager.aadClientId);

		await workspace.getConfiguration().update(PORTAL_SETTING_PREFIX_ID + '.dynamicsInstanceName', this.d365InstanceName);
		await workspace.getConfiguration().update(PORTAL_SETTING_PREFIX_ID + '.dynamicsCrmRegion', this.d365CrmRegion);
		await workspace.getConfiguration().update(PORTAL_SETTING_PREFIX_ID + '.useFoldersForFiles', this.useFoldersForWebFiles);
	}

	async storeConfigurationFile(): Promise<void> {
		if (!this.portalId || !this.portalName || (this.useFoldersForWebFiles && !this.defaultPageTemplate)) {
			console.error('Could not store configuration file because portalId or portalName are not set.');
			return;
		}

		const config: IPortalConfigurationFile = {
			portalId: this.portalId,
			portalName: this.portalName,
			defaultPageTemplateId: this.defaultPageTemplate
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

export async function getConsent(question: string): Promise<boolean> {
	const options = ['Yes', 'No'];
	const answer = await window.showQuickPick(options, { placeHolder: question });

	if (answer && answer === options[0]) {
		console.log('[START] User consent for ' + question);
		return true;
	}
	return false;
}
