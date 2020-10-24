import { ExtensionContext, workspace } from 'vscode';
import { CredentialManager } from './credentialManager';
import { multiStepInput } from './quickInputConfigurator';


export class ConfigurationManager {

	d365InstanceName: string | undefined;
	d365CrmRegion: string | undefined;
	credentialManager: CredentialManager | undefined;
	portalId: string | undefined;
	portalName: string | undefined;

	constructor() {
	}

	get isConfigured(): boolean {
		if (this.d365InstanceName && this.d365CrmRegion && this.credentialManager?.isConfigured) {
			return true;
		}
		return false;
	}

	public async load(context: ExtensionContext) {
		// either the values can be loaded from a configuration file or the configuration quickInput has to be used
		try {
			await this.loadConfiguration();
		} catch (error) {
			console.log('Could not get pre existing configuration from config store. Getting new values. Error: ' + error);
		}

		if (this.isConfigured) {
			console.log('Configuration successfully loaded from local store.');
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
				throw Error('Could not load either client id or tenant id from local config store.');
			}

			this.credentialManager = new CredentialManager(aadTenantId, aadClientId);
		} catch (error) {
			throw Error('Could not load configuration form config file: ' + error);
		}
		
		await this.credentialManager.loadCredentials();
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

	private async storeConfiguration() {
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
}