import { Configuration, DeviceCodeRequest, PublicClientApplication, SilentFlowRequest } from "@azure/msal-node";
import { AccountInfo, AuthenticationResult, DeviceCodeResponse } from "@azure/msal-common";
import { ConfigurationManager } from "../configuration/configurationManager";
import { IXrmAuthenticationProvider } from "../models/interfaces/authenticationProvider";

export class MsalConnection implements IXrmAuthenticationProvider {
	instanceName: string;
	resourceUrl: string;
	crmRegion: string;
	authenticated: boolean;

	private aadClientId: string;
	private aadClientSecret: string;
	private aadTenantId: string;
	private msalConfig: Configuration;
	private clientApp: PublicClientApplication;
	private deviceCodeRequest: DeviceCodeRequest;
	private accountInfo: AccountInfo | null | undefined;

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

		const authorityUrl = `https://login.microsoftonline.com/${this.aadTenantId}/`;

		this.msalConfig = {
			auth: {
				clientId: this.aadClientId,
				authority: authorityUrl,
				clientSecret: this.aadClientSecret
			}
		};
		this.clientApp = new PublicClientApplication(this.msalConfig);
		this.deviceCodeRequest = {
			deviceCodeCallback: this.deviceCodeCallback,
			scopes: ["offline_access"],

		};

	}

	acquireToken(callback: DynamicsWebApi.OnTokenAcquiredCallback): void {
		
		// try to get token silently
		if (this.accountInfo) {
			const silentRequest: SilentFlowRequest = {
				account: this.accountInfo,
				scopes: []
			};
			this.clientApp.acquireTokenSilent(silentRequest)
				.then((response: AuthenticationResult | null) => {
					console.log('Token acquired silently: ' + response?.expiresOn);
					callback({accessToken: response?.accessToken || ''});
				}).catch((error) => {
					console.error(JSON.stringify(error));
				});
		} else {
			this.clientApp.acquireTokenByDeviceCode(this.deviceCodeRequest).then((response: AuthenticationResult | null) => {
				console.log('Token acquired: ' + response?.expiresOn);
				this.accountInfo = response?.account;
				callback(response?.accessToken);
			}).catch((error) => {
				console.error(JSON.stringify(error));
			});
		}
	}

	deviceCodeCallback(response: DeviceCodeResponse) {
		console.log(response.message);
	}

}