import { AuthenticationContext, ErrorResponse, TokenResponse, UserCodeInfo } from "adal-node";
import { OnTokenAcquiredCallback } from "dynamics-web-api";
import * as vscode from "vscode";

import { ConfigurationManager } from "../configuration/configurationManager";
import { IXrmAuthenticationProvider } from "../models/interfaces/authenticationProvider";
import { DialogReporter } from "../telemetry/DialogReporter";

export class XrmAdalDeviceCredentialsAuthentication implements IXrmAuthenticationProvider {
    instanceName: string;
    resourceUrl: string;
    crmRegion: string;
    authenticated: boolean;

    private aadClientId: string;
    private accessToken: string | undefined;
    private accessTokenExpiry: Date | undefined;
    private refreshToken: string | undefined;
    private aadTenantId: string;
    private adalContext: AuthenticationContext;
    private configurationManager: ConfigurationManager;

    constructor(configurationManager: ConfigurationManager) {
        if (!configurationManager.isConfigured) {
            throw new Error("[AUTH] Configuration Manager is not configured.");
        }
        const credentials = configurationManager.credentialManager?.getCredentials();

        this.configurationManager = configurationManager;
        this.instanceName = configurationManager.d365InstanceName || "";
        this.crmRegion = configurationManager.d365CrmRegion || "";
        this.aadClientId = credentials?.clientId || "";
        this.refreshToken = credentials?.secret || "";
        this.aadTenantId = credentials?.aadTenantId || "";
        this.resourceUrl = `https://${this.instanceName}.${this.crmRegion}.dynamics.com`;
        this.authenticated = false;

        const authorityUrl = `https://login.microsoftonline.com/${this.aadTenantId}/oauth2/token`;
        this.adalContext = new AuthenticationContext(authorityUrl);
    }

    public acquireToken(callback: OnTokenAcquiredCallback): void {
        const acquireAsync = async () => {
            let accessToken = await this.tryGetAccessToken();
            if (accessToken) {
                callback(accessToken);
                return;
            }

            // not possible to reuse access token -> try to get access token using refresh token
            try {
                accessToken = await this.tryGetAccessTokenWithRefreshToken();
            } catch (error) {
                console.error(error);
            }

            if (accessToken) {
                callback(accessToken);
                return;
            }

            // everything failed -> authenticate with device code flow
            try {
                accessToken = await this.loginWithDeviceCodeFlow();
            } catch (error) {
                await DialogReporter.reportError(error, "Could not login.");
                return;
            }

            // access token successful -> save refresh token and start callback
            if (this.refreshToken) {
                console.log("[AUTH] Save refresh token");
                await this.configurationManager.credentialManager?.setSecret(this.refreshToken || "");
                console.log("[AUTH] Refresh token saved");
            }

            callback(accessToken);
        };
        void acquireAsync();
    }

    private async loginWithDeviceCodeFlow(): Promise<string> {
        return new Promise((resolve, reject) => {
            console.log("[AUTH] Beginning authentication with device flow");
            const callback = (error: Error, response: UserCodeInfo) => {
                const performAuthentication = async () => {
                    if (error) {
                        console.error("[AUTH] Error when acquiring user code");
                        console.error(error);
                        reject(error.message);
                        return;
                    }

                    console.log("[AUTH] calling acquire token with device code");
                    try {
                        await this.startUserFlow(response.userCode, response.verificationUrl);
                    } catch (error) {
                        reject(error);
                        return;
                    }

                    this.adalContext.acquireTokenWithDeviceCode(
                        this.resourceUrl,
                        this.aadClientId,
                        response,
                        (error: Error, response: TokenResponse | ErrorResponse) => {
                            if (error) {
                                reject(`[AUTH] Could not get access code with device code flow: ${error.name} - ${error.message}`);
                            } else {
                                const tokenResponse = <TokenResponse>response;
                                if (!tokenResponse) {
                                    reject(
                                        "[AUTH] Could not acquire access token with device code flow - Error Response: " +
                                            response.error +
                                            " Desc: " +
                                            response.errorDescription
                                    );
                                } else {
                                    console.log(
                                        "[AUTH] Received access token with device code flow. Valid until: " + tokenResponse.expiresOn
                                    );
                                    this.accessToken = tokenResponse.accessToken;
                                    this.accessTokenExpiry = new Date(tokenResponse.expiresOn);
                                    this.refreshToken = tokenResponse.refreshToken;
                                    resolve(tokenResponse.accessToken);
                                }
                            }
                        }
                    );
                };
                void performAuthentication();
            };
            this.adalContext.acquireUserCode(this.resourceUrl, this.aadClientId, "en-us", callback);
        });
    }

    private async startUserFlow(userCode: string, verificationUrl: string) {
        const msg = `Copy & Paste this code -> ${userCode} <-. Then, click on ok and paste the code into your browser window. (If no browser opened, go to aka.ms/devicelogin to type in the code.)`;
        const openBrowser = await vscode.window.showInformationMessage(msg, "Ok", "Cancel");

        if (openBrowser && openBrowser === "Ok") {
            void vscode.env.openExternal(vscode.Uri.parse(`${verificationUrl}`));
        }

        if (openBrowser && openBrowser === "Cancel") {
            throw new Error("User Canceled");
        }
    }

    private tryGetAccessToken(): Promise<string | undefined> {
        return new Promise((resolve) => {
            // check access token first
            const token = this.accessToken;
            if (token && this.accessTokenExpiry && new Date() < this.accessTokenExpiry) {
                resolve(token);
            } else {
                console.log("[AUTH] Access code not set");
                resolve(undefined);
            }
        });
    }

    private tryGetAccessTokenWithRefreshToken(): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            if (!this.refreshToken) {
                console.log("[AUTH] Access Code not set.");
                resolve(undefined);
            } else {
                this.adalContext.acquireTokenWithRefreshToken(
                    this.refreshToken,
                    this.aadClientId,
                    this.resourceUrl,
                    (error: Error, response: TokenResponse | ErrorResponse) => {
                        if (error) {
                            reject("[AUTH] Could not acquire access token with refresh token: " + error.message);
                        } else {
                            const tokenResponse = <TokenResponse>response;
                            if (!tokenResponse) {
                                reject(
                                    "[AUTH] Could not acquire access token with refresh token - Error Response: " +
                                        response.error +
                                        " Desc: " +
                                        response.errorDescription
                                );
                            } else {
                                console.log("[AUTH] Received access token. Valid until: " + tokenResponse.expiresOn);
                                this.accessToken = tokenResponse.accessToken;
                                this.accessTokenExpiry = new Date(tokenResponse.expiresOn);
                                resolve(tokenResponse.accessToken);
                            }
                        }
                    }
                );
            }
        });
    }
}

