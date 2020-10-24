import { AuthenticationContext, ErrorResponse, TokenResponse } from 'adal-node';
import { OnTokenAcquiredCallback } from 'dynamics-web-api';
import { ConfigurationManager } from '../configuration/configurationManager';

export class CrmAdalConnectionSettings {
	instanceName: string;
	resourceUrl: string;
	crmRegion: string;
	authenticated: boolean;

	private aadClientId: string;
	private aadClientSecret: string;
	private aadTenantId: string;
	private adalContext: AuthenticationContext;

	constructor(configurationManager: ConfigurationManager) {
		if (!configurationManager.isConfigured) {
			throw new Error('Configuration Manager is not configured.');
		}
		const creds = configurationManager.credentialManager?.getCredentials();

		this.instanceName = configurationManager.d365InstanceName || '';
		this.crmRegion = configurationManager.d365CrmRegion || '';
		this.aadClientId = creds?.clientId || '';
		this.aadClientSecret = creds?.clientSecret || '';
		this.aadTenantId = creds?.aadTenantId || '';
		this.resourceUrl = `https://${this.instanceName}.${this.crmRegion}.dynamics.com`;
		this.authenticated = false;

		const authorityUrl = `https://login.microsoftonline.com/${this.aadTenantId}/oauth2/token`;
		this.adalContext = new AuthenticationContext(authorityUrl);
	}

	public aquireToken(callback: OnTokenAcquiredCallback) {
		const adalTokenAquiredCallback = (error: Error, response: TokenResponse | ErrorResponse) => {
			if (error) {
				const errorMessage = `Could not authenticate with provided credentials. \nError Details:\n\tMessage: ${error.message}\n\tStack: ${error.stack}`;
				console.error(errorMessage);
				return;
			}

			// authentication successful
			console.log('Authentication was sucessful.');
			callback(response);
		};

		console.log('Beginning authentication with provided clientId and clientSecret.');
		this.adalContext.acquireTokenWithClientCredentials(
			this.resourceUrl,
			this.aadClientId,
			this.aadClientSecret,
			adalTokenAquiredCallback
		);
		console.log('Authentication prepared.');
	}
}
