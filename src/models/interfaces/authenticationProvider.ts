import { OnTokenAcquiredCallback } from "dynamics-web-api";

export interface IXrmAuthenticationProvider {
	instanceName: string;
	resourceUrl: string;
	crmRegion: string;
	authenticated: boolean;

	acquireToken(callback: OnTokenAcquiredCallback): void;
}