import { AuthenticationContext, ErrorResponse, TokenResponse, UserCodeInfo } from 'adal-node';
import { OnTokenAcquiredCallback } from 'dynamics-web-api';
import { ConfigurationManager } from '../configuration/configurationManager';
import * as vscode from 'vscode';
import { IXrmAuthenticationProvider } from '../models/interfaces/authenticationProvider';

export class XrmAdalClientCredentialsAuthentication implements IXrmAuthenticationProvider {
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
			throw new Error('[AUTH] Configuration Manager is not configured.');
		}
		const credentials = configurationManager.credentialManager?.getCredentials();

		this.instanceName = configurationManager.d365InstanceName || '';
		this.crmRegion = configurationManager.d365CrmRegion || '';
		this.aadClientId = credentials?.clientId || '';
		this.aadClientSecret = credentials?.secret || '';
		this.aadTenantId = credentials?.aadTenantId || '';
		this.resourceUrl = `https://${this.instanceName}.${this.crmRegion}.dynamics.com`;
		this.authenticated = false;

		const authorityUrl = `https://login.microsoftonline.com/${this.aadTenantId}/oauth2/token`;
		this.adalContext = new AuthenticationContext(authorityUrl);
	}

	public acquireToken(callback: OnTokenAcquiredCallback) {
		const adalTokenAcquiredCallback = (error: Error, response: TokenResponse | ErrorResponse) => {
			if (error) {
				const errorMessage = `Could not authenticate with provided credentials. \nError Details:\n\tMessage: ${error.message}\n\tStack: ${error.stack}`;
				console.error('[AUTH] ' + errorMessage);
				vscode.window.showErrorMessage(`Could not authenticate with provided credentials. To configure the extension again, issue the command '>Power Pages: Configure'. \nError Details:\n\tMessage: ${error.message}`);
			}

			// authentication successful
			console.log('[AUTH] Authentication was successful.');
			callback(response);
		};

		console.log('[AUTH] Beginning authentication with provided clientId and clientSecret.');
		this.adalContext.acquireTokenWithClientCredentials(
			this.resourceUrl,
			this.aadClientId,
			this.aadClientSecret,
			adalTokenAcquiredCallback
		);
		console.log('[AUTH] Authentication prepared.');
	}
}



