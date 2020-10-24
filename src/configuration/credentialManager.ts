import { ICredentials } from "../models/interfaces/credentials";
import * as keytarType from 'keytar';
import { env } from 'vscode';

const keytar = getNodeModule<typeof keytarType>('keytar');

declare const __webpack_require__: typeof require;
declare const __non_webpack_require__: typeof require;

function getNodeModule<T>(moduleName: string): T | undefined {
	const r = typeof __webpack_require__ === "function" ? __non_webpack_require__ : require;
	try {
		return r(`${env.appRoot}/node_modules.asar/${moduleName}`);
	} catch (err) {
		// Not in ASAR.
	}
	try {
		return r(`${env.appRoot}/node_modules/${moduleName}`);
	} catch (err) {
		// Not available.
	}
	return undefined;
}

const credentialsSection = 'vscode.powerapps-portals-development';

export class CredentialManager {

	private creds: ICredentials;
	public aadTenantId: string;
	public aadClientId: string;
	
	constructor(aadTenantId: string, aadClientId: string) {
		this.aadClientId = aadClientId;
		this.aadTenantId = aadTenantId;

		this.creds = {
			aadTenantId: aadTenantId,
			clientId: aadClientId,
			clientSecret: ''
		};
	}

	get isConfigured(): boolean {
		if (this.aadTenantId && this.aadClientId && this.creds.clientSecret){
			return true;
		}
		return false;
	}

	public async setClientSecret(clientSecret: string) {
		this.creds.clientSecret = clientSecret;
		await this.storeSecret(this.aadClientId, clientSecret);
	}

	public async loadCredentials() {
		const secret = await this.getSecret(this.aadClientId);
		if (!secret || secret === null) {
			return;
		}
		this.creds.clientSecret = secret;
	}

	public getCredentials(): ICredentials | undefined {
		if (this.isConfigured) {
			return this.creds;
		}
		
		return undefined;
	}

	private async getSecret(aadClientId: string): Promise<string | null> {
		if (!keytar) {
			return null;
		}

		try {
			return await keytar.getPassword(credentialsSection, aadClientId);
		} catch (err) {
			// ignore
		}
		return null;
	}

	private async storeSecret(aadClientId: string, clientSecret: string) {
		if (keytar) {
			try {
				await keytar.setPassword(credentialsSection, aadClientId, clientSecret);
			} catch (err) {
				// ignore
			}
		}
	}
}