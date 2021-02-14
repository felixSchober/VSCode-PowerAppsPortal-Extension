import { ICredentials } from "../models/interfaces/credentials";
import * as keytarType from 'keytar';
import { env } from 'vscode';
import { AuthenticationMethod } from "./configurationManager";

const keytar = getNodeModule<typeof keytarType>('keytar');

// eslint-disable-next-line @typescript-eslint/naming-convention
declare const __webpack_require__: typeof require;
// eslint-disable-next-line @typescript-eslint/naming-convention
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

	private credentials: ICredentials;
	public aadTenantId: string;
	public aadClientId: string;
	private authenticationMethod: AuthenticationMethod;
	
	constructor(aadTenantId: string, aadClientId: string, authenticationMethod: AuthenticationMethod | undefined) {
		this.aadClientId = aadClientId;
		this.aadTenantId = aadTenantId;
		this.authenticationMethod  = authenticationMethod || AuthenticationMethod.clientCredentials;

		this.credentials = {
			aadTenantId: aadTenantId,
			clientId: aadClientId,
			secret: ''
		};
	}

	get isConfigured(): boolean {
		if (this.authenticationMethod === AuthenticationMethod.clientCredentials) {
			if (this.aadTenantId && this.aadClientId && this.credentials.secret){
				return true;
			}
		} else {
			if (this.aadTenantId && this.aadClientId){
				return true;
			}

		}
		return false;
	}

	public async setSecret(secret: string) {
		this.credentials.secret = secret;
		await this.storeSecret(secret);
	}

	public async loadCredentials() {
		const secret = await this.getSecret();
		if (!secret || secret === null) {
			return;
		}
		this.credentials.secret = secret;
	}

	public getCredentials(): ICredentials | undefined {
		if (this.isConfigured) {
			return this.credentials;
		}
		
		return undefined;
	}

	private get keyPhraseName(): string {
		return (this.authenticationMethod === AuthenticationMethod.clientCredentials ? '' : 'r_') + this.aadClientId;
	}

	private async getSecret(): Promise<string | null> {
		if (!keytar) {
			return null;
		}

		try {
			return await keytar.getPassword(credentialsSection, this.keyPhraseName);
		} catch (err) {
			// ignore
		}
		return null;
	}

	private async storeSecret(clientSecret: string) {
		if (keytar) {
			try {
				await keytar.setPassword(credentialsSection, this.keyPhraseName, clientSecret);
			} catch (err) {
				// ignore
			}
		}
	}
}