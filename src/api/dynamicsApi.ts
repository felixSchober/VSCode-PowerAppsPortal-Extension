/* eslint-disable @typescript-eslint/naming-convention */
var dynamicsWebApi = require('dynamics-web-api');
import {
	CreateRequest,
	DeleteRequest,
	RetrieveMultipleRequest,
	UpdateRequest,
} from 'dynamics-web-api';
import { ConfigurationManager } from '../configuration/configurationManager';
import { ContentSnippet } from '../models/ContentSnippet';
import { CONTENTSNIPPET_SELECT, ID365ContentSnippet } from '../models/interfaces/d365ContentSnippet';
import { ID365PortalLanguage, ID365WebsiteLanguage } from '../models/interfaces/d365Language';
import { ID365Note, NOTE_SELECT } from '../models/interfaces/d365Note';
import { ID365PageTemplate, PAGETEMPLATE_SELECT } from '../models/interfaces/d365PageTemplate';
import { ID365PublishingState } from '../models/interfaces/d365PublishingState';
import { ID365WebFile } from '../models/interfaces/d365WebFile';
import { ID365Webpage, WEBPAGE_SELECT } from '../models/interfaces/d365Webpage';
import { ID365Website } from '../models/interfaces/d365Website';
import { ID365WebTemplate, WEBTEMPLATE_SELECT } from '../models/interfaces/d365WebTemplate';
import { WebFile } from '../models/WebFile';
import { WebPage } from '../models/webPage';
import { WebTemplate } from '../models/WebTemplate';
import { CrmAdalConnectionSettings } from './adalConnection';

export class DynamicsApi {
	private webApi: DynamicsWebApi;

	d365InstanceName: string | undefined;
	d365CrmRegion: string | undefined;
	private configurationManager: ConfigurationManager;
	private defaultRequestTimeout: number = 5000;
	constructor(configurationManager: ConfigurationManager) {
		this.configurationManager = configurationManager;
		const adalConnect = this.getAdalConnection();

		this.d365InstanceName = this.configurationManager.d365InstanceName;
		this.d365CrmRegion = this.configurationManager.d365CrmRegion;

		const webApiUrl = `https://${this.d365InstanceName}.${this.d365CrmRegion}.dynamics.com/api/data/v9.1/`;
		this.webApi = new dynamicsWebApi({
			webApiUrl: webApiUrl,
			onTokenRefresh: (callback: any) => adalConnect.acquireToken(callback),
		});
	}

	public async getLanguages(portalId: string): Promise<Map<string, ID365PortalLanguage>> {
		const websiteLanguageRequest: RetrieveMultipleRequest = {
			collection: 'adx_websitelanguages',
			select: ['adx_websitelanguageid', 'adx_name', '_adx_portallanguageid_value'],
			filter: '_adx_websiteid_value eq ' + portalId,
			timeout: this.defaultRequestTimeout,
		};
		const websiteLanguageResponse = await this.webApi.retrieveAllRequest<ID365WebsiteLanguage>(
			websiteLanguageRequest
		);

		const portalLanguageRequest: RetrieveMultipleRequest = {
			collection: 'adx_portallanguages',
			select: ['adx_languagecode', 'adx_displayname', 'adx_portallanguageid'],
			timeout: this.defaultRequestTimeout,
		};
		const portalLanguageResponse = await this.webApi.retrieveAllRequest<ID365PortalLanguage>(portalLanguageRequest);

		const result = new Map<string, ID365PortalLanguage>();

		for (const websiteLanguage of websiteLanguageResponse.value || []) {
			// try get the matching portal language
			const portalLanguage = portalLanguageResponse.value?.find(
				(l) => l.adx_portallanguageid === websiteLanguage._adx_portallanguageid_value
			);
			if (portalLanguage) {
				result.set(websiteLanguage.adx_websitelanguageid, portalLanguage);
			} else {
				console.warn(`Could not fit website language for portal language ${websiteLanguage.adx_name}`);
			}
		}

		return result;
	}

	public async getPortals(): Promise<Map<string, string>> {
		const result = new Map<string, string>();

		const request: RetrieveMultipleRequest = {
			select: ['adx_websiteid', 'adx_name'],
			collection: 'adx_websites',
			timeout: this.defaultRequestTimeout,
		};
		const response = await this.webApi.retrieveAllRequest<ID365Website>(request);
		if (!response.value) {
			return result;
		}

		for (const website of response.value) {
			result.set(website.adx_name, website.adx_websiteid);
		}
		return result;
	}

	public async getPortalId(portalName: string): Promise<string> {
		const request: RetrieveMultipleRequest = {
			select: ['adx_websiteid'],
			filter: `adx_name eq '${portalName}'`,
			collection: 'adx_websites',
			timeout: this.defaultRequestTimeout,
		};

		const response = await this.webApi.retrieveMultipleRequest<ID365Website>(request);

		if (response.value?.length !== 1) {
			throw Error(
				`Found either no portal with the name ${portalName} or too many (result set: ${response.value?.length})`
			);
		}
		const result = response.value[0].adx_websiteid;
		return result;
	}

	public async getWebPageHierarchy(portalId: string): Promise<Map<string, WebPage>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_webpages',
			select: WEBPAGE_SELECT,
			filter: `_adx_websiteid_value eq ${portalId}`,
			timeout: this.defaultRequestTimeout,
		};
		const response = await this.webApi.retrieveAllRequest<ID365Webpage>(request);

		if (!response.value) {
			return new Map<string, WebPage>();
		}

		const webPagesMap = new Map<string, ID365Webpage>(
			response.value.map((webPage) => [webPage.adx_webpageid, webPage])
		);

		console.log('[D365 API] Constructing web page hierarchy');
		const webPageHierarchy = WebPage.createWebPageHierarchy(webPagesMap);

		return webPageHierarchy;
	}

	public async getWebpageId(name: string, portalId: string): Promise<string> {
		const filter = `_adx_websiteid_value eq ${portalId} and adx_name eq '${name}' and adx_isroot eq true`;

		const request: RetrieveMultipleRequest = {
			select: ['adx_webpageid'],
			filter: filter,
			collection: 'adx_webpages',
			timeout: this.defaultRequestTimeout,
		};

		const response = await this.webApi.retrieveMultipleRequest<ID365Webpage>(request);

		if (response.value?.length !== 1) {
			throw Error(
				`Found either no webpage with the name ${name} or too many (result set: ${response.value?.length}). filter: ${filter}`
			);
		}
		const result = response.value[0].adx_webpageid;
		return result;
	}

	public async createWebPage(newWebPage: Partial<ID365Webpage>): Promise<ID365Webpage> {
		const webPageCreateModel: any = {
			adx_name: newWebPage.adx_name,
			adx_partialurl: newWebPage.adx_partialurl,
			adx_hiddenfromsitemap: newWebPage.adx_hiddenfromsitemap,
			'adx_publishingstateid@odata.bind': `adx_publishingstates(${newWebPage._adx_publishingstateid_value})`,
			'adx_pagetemplateid@odata.bind': `adx_pagetemplates(${newWebPage._adx_pagetemplateid_value})`,
			'adx_websiteid@odata.bind': `adx_websites(${newWebPage._adx_websiteid_value})`,
		};

		if (newWebPage._adx_parentpageid_value) {
			webPageCreateModel['adx_parentpageid@odata.bind'] = `adx_webpages(${newWebPage._adx_parentpageid_value})`;

		}

		const request: CreateRequest = {
			collection: 'adx_webpages',
			entity: webPageCreateModel,
			returnRepresentation: true,
			timeout: this.defaultRequestTimeout,
		};

		const createdWebPage = await this.webApi.createRequest<ID365Webpage>(request);
		if (!createdWebPage.adx_webpageid) {
			throw Error('Id of webpage from dynamics api was not defined. (04)');
		}
		return createdWebPage;
	}

	public async getPublishedPublishStateId(portalId: string): Promise<string> {
		const filter = `_adx_websiteid_value eq ${portalId} and adx_name eq 'Published'`;

		const request: RetrieveMultipleRequest = {
			select: ['adx_publishingstateid'],
			filter: `_adx_websiteid_value eq ${portalId} and adx_name eq 'Published'`,
			collection: 'adx_publishingstates',
			timeout: this.defaultRequestTimeout,
		};

		const response = await this.webApi.retrieveMultipleRequest<ID365PublishingState>(request);
		if (!response || !response.value || response.value.length < 1) {
			throw Error(`Found no publishing state for portal with id ${portalId}. Filter expression: ${filter}`);
		}

		const result = response.value[0].adx_publishingstateid;
		return result;
	}

	public async getContentSnippets(
		websiteId: string,
		languages: Map<string, ID365PortalLanguage>,
		filterInactive: boolean = true,
		filterLastRefreshed: string | undefined = undefined
	): Promise<Array<ContentSnippet>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_contentsnippets',
			select: CONTENTSNIPPET_SELECT,
			filter: '_adx_websiteid_value eq ' + websiteId,
			timeout: this.defaultRequestTimeout,
		};

		this.addStandardFilters(filterInactive, filterLastRefreshed, request);

		const response = await this.webApi.retrieveAllRequest<ID365ContentSnippet>(request);
		if (!response.value) {
			throw Error(`Could not get content snippets from dynamics instance for website with id ${websiteId}.`);
		}

		return response.value.map((c) => {
			const languageCode = languages.get(c._adx_contentsnippetlanguageid_value)?.adx_languagecode || 'en-US';
			if (!c.adx_contentsnippetid) {
				throw Error('Id of contentsnippet from dynamics api was not defined. (01)');
			}
			return new ContentSnippet(c.adx_value, languageCode, c.adx_contentsnippetid, c.adx_name);
		});
	}

	public async updateContentSnippet(update: ContentSnippet): Promise<ContentSnippet> {
		const request: UpdateRequest = {
			collection: 'adx_contentsnippets',
			key: update.id,
			returnRepresentation: true,
			select: CONTENTSNIPPET_SELECT,
			entity: {
				adx_value: update.source,
			},
			timeout: this.defaultRequestTimeout,
		};

		const c = await this.webApi.updateRequest<ID365ContentSnippet>(request);
		if (!c.adx_contentsnippetid) {
			throw Error('Id of contentsnippet from dynamics api was not defined. (02)');
		}
		return new ContentSnippet(
			c.adx_value,
			c._adx_contentsnippetlanguageid_value,
			c.adx_contentsnippetid,
			c.adx_name
		);
	}

	public async addContentSnippet(newSnippet: ID365ContentSnippet): Promise<ContentSnippet> {
		const contentSnippetCreateModel: any = {
			adx_name: newSnippet.adx_name,
			adx_value: newSnippet.adx_value,
			'adx_contentsnippetlanguageid@odata.bind': `adx_websitelanguages(${newSnippet._adx_contentsnippetlanguageid_value})`,
			'adx_websiteid@odata.bind': `adx_websites(${newSnippet._adx_websiteid_value})`,
		};

		const request: CreateRequest = {
			collection: 'adx_contentsnippets',
			entity: contentSnippetCreateModel,
			returnRepresentation: true,
			timeout: this.defaultRequestTimeout,
		};

		const c = await this.webApi.createRequest<ID365ContentSnippet>(request);
		if (!c.adx_contentsnippetid) {
			throw Error('Id of contentsnippet from dynamics api was not defined. (03)');
		}
		return new ContentSnippet(
			c.adx_value,
			c._adx_contentsnippetlanguageid_value,
			c.adx_contentsnippetid,
			c.adx_name
		);
	}

	public async deleteContentSnippet(id: string): Promise<void> {
		const request: DeleteRequest = {
			collection: 'adx_contentsnippets',
			key: id,
			timeout: this.defaultRequestTimeout,
		};
		await this.webApi.deleteRequest(request);
	}

	public async getPageTemplates(websiteId: string, filterInactive: boolean = true, filterLastRefreshed: string | undefined = undefined): Promise<Array<ID365PageTemplate>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_pagetemplates',
			select: PAGETEMPLATE_SELECT,
			filter: '_adx_websiteid_value eq ' + websiteId,
		};

		this.addStandardFilters(filterInactive, filterLastRefreshed, request);

		const response = await this.webApi.retrieveAllRequest<ID365PageTemplate>(request);
		if (!response.value) {
			throw Error(`Could not get page templates from dynamics instance for website with id ${websiteId}.`);
		}

		return response.value;
	}

	public async getWebTemplates(websiteId: string, filterInactive: boolean = true, filterLastRefreshed: string | undefined = undefined): Promise<Array<WebTemplate>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_webtemplates',
			select: WEBTEMPLATE_SELECT,
			filter: '_adx_websiteid_value eq ' + websiteId,
		};

		this.addStandardFilters(filterInactive, filterLastRefreshed, request);

		const response = await this.webApi.retrieveAllRequest<ID365WebTemplate>(request);
		if (!response.value) {
			throw Error(`Could not get web templates from dynamics instance for website with id ${websiteId}.`);
		}

		const result: Array<WebTemplate> = response.value.map((e) => new WebTemplate(e));
		return result;
	}

	public async updateWebTemplate(update: WebTemplate): Promise<WebTemplate> {
		const request: UpdateRequest = {
			collection: 'adx_webtemplates',
			key: update.id,
			returnRepresentation: true,
			select: WEBTEMPLATE_SELECT,
			entity: {
				adx_source: update.source,
			},
			timeout: this.defaultRequestTimeout,
		};

		const result = await this.webApi.updateRequest<ID365WebTemplate>(request);
		return new WebTemplate(result);
	}

	public async addWebTemplate(newTemplate: ID365WebTemplate): Promise<WebTemplate> {
		const contentSnippetCreateModel: any = {
			adx_name: newTemplate.adx_name,
			adx_source: newTemplate.adx_source,
			'adx_websiteid@odata.bind': `adx_websites(${newTemplate._adx_websiteid_value})`,
		};

		const request: CreateRequest = {
			collection: 'adx_webtemplates',
			entity: contentSnippetCreateModel,
			returnRepresentation: true,
			timeout: this.defaultRequestTimeout,
		};

		const result = await this.webApi.createRequest<ID365WebTemplate>(request);
		return new WebTemplate(result);
	}

	public async deleteWebTemplate(templateId: string): Promise<void> {
		const request: DeleteRequest = {
			collection: 'adx_webtemplates',
			key: templateId,
			timeout: this.defaultRequestTimeout,
		};
		await this.webApi.deleteRequest(request);
	}

	public async deleteWebFile(webFileId: string, webNoteId: string): Promise<void> {
		const noteRequest: DeleteRequest = {
			collection: 'annotations',
			key: webNoteId,
			timeout: this.defaultRequestTimeout,
		};

		const fileRequest: DeleteRequest = {
			collection: 'adx_webfiles',
			key: webFileId,
			timeout: this.defaultRequestTimeout,
		};
		await this.webApi.deleteRequest(noteRequest);
		await this.webApi.deleteRequest(fileRequest);
	}

	public async getWebFiles(portalId: string, webPageHierarchy: Map<string, WebPage>, filterInactive: boolean = true, filterLastRefreshed: string | undefined = undefined): Promise<Array<WebFile>> {
		const request: RetrieveMultipleRequest = {
			select: ['adx_webfileid', 'adx_name', 'adx_partialurl', '_adx_websiteid_value', '_adx_parentpageid_value'],
			filter: '_adx_websiteid_value eq ' + portalId,
			collection: 'adx_webfiles',
			timeout: this.defaultRequestTimeout,
		};

		this.addStandardFilters(filterInactive, filterLastRefreshed, request);

		console.log('[D365 API] Getting web file');
		const response = await this.webApi.retrieveAllRequest<ID365WebFile>(request);
		if (!response.value) {
			console.error("[D365 API] Couldn't get web files. Response value was empty.");
			return [];
		}

		console.log('[D365 API] Getting web file notes');
		const webFileNotes = await this.getWebFileNotes();

		// create a map out of the web file notes with the key being the id of the corresponding webfile id.
		const webFileNotesMap = new Map<string, ID365Note>(
			webFileNotes.map((note) => [note._objectid_value || '', note])
		);

		let result: Array<WebFile> = [];

		for (const webFile of response.value) {
			if (!webFile.adx_webfileid) {
				throw Error(`Could not get web file with name ${webFile.adx_name} because id was undefined.`);
			}
			// get corresponding note
			const note = webFileNotesMap.get(webFile.adx_webfileid);

			if (!note) {
				console.warn(
					`Could not get file contents for web file with id ${webFile.adx_webfileid} and name ${webFile.adx_name}`
				);
				continue;
			}

			const wf = WebFile.getWebFile(this.configurationManager.useFoldersForWebFiles, webFile, note, webPageHierarchy);
			result.push(wf);
		}

		return result;
	}

	public async getWebFileNotes(filterLastRefreshed: string | undefined = undefined): Promise<Array<ID365Note>> {
		const request: RetrieveMultipleRequest = {
			collection: 'annotations',
			filter: `objecttypecode eq 'adx_webfile' and isdocument eq true`,
			select: NOTE_SELECT,
			timeout: this.defaultRequestTimeout,
		};

		this.addStandardFilters(false, filterLastRefreshed, request);

		const response = await this.webApi.retrieveAllRequest<ID365Note>(request);

		if (!response.value) {
			return [];
		}
		return response.value;
	}

	public async uploadFile(
		note: ID365Note,
		websiteId: string,
		parentPageId: string,
		publishingStateId: string,
		parentPage: WebPage
	): Promise<WebFile> {
		console.log(`\t[D365 API] Creating webfile ${note.filename}`);
		const file = await this.createWebFile(note.filename, websiteId, parentPageId, publishingStateId);

		if (!file.adx_webfileid) {
			throw Error(`[D365 API] Webfile for file ${note.filename} was not created successfully -> no id on object`);
		}

		console.log(`\t[D365 API] Uploading contents to webfile ${note.filename}. File Id: ${file.adx_webfileid}`);
		const createdNote = await this.createNote(note, file.adx_webfileid);

		console.log('\t[D365 API] Uploaded file: ' + createdNote.filename);
		return new WebFile(this.configurationManager.useFoldersForWebFiles, file, createdNote, parentPage);
	}

	public async updateFiles(files: Array<ID365Note>): Promise<Array<ID365Note>> {
		const result: Array<ID365Note> = [];

		for (const f of files) {
			if (!f.annotationid) {
				throw Error(`[D365 API] Could not update file with name: ${f.filename}. Existing id was undefined.`);
			}

			const updatedImage: any = {
				documentbody: f.documentbody,
				mimetype: f.mimetype,
			};

			const request: UpdateRequest = {
				collection: 'annotations',
				entity: updatedImage,
				key: f.annotationid,
				returnRepresentation: false,
				timeout: this.defaultRequestTimeout,
			};

			console.log(`\t[D365 API] Updating file ${f.filename} to D365`);
			await this.webApi.updateRequest(request);
			console.log('\t[D365 API] Updated file: ' + f.filename);
			result.push(f);
		}
		return result;
	}

	private async createWebFile(
		name: string,
		websiteId: string,
		parentPageId: string,
		publishingStateId: string
	): Promise<ID365WebFile> {
		const select = ['adx_webfileid', 'adx_name', 'adx_partialurl', '_adx_websiteid_value'];
		const file: any = {
			adx_name: name,
			adx_partialurl: name,
			'adx_websiteid@odata.bind': `adx_websites(${websiteId})`,
			'adx_parentpageid@odata.bind': `adx_webpages(${parentPageId})`,
			'adx_publishingstateid@odata.bind': `adx_publishingstates(${publishingStateId})`,
		};

		const request: CreateRequest = {
			collection: 'adx_webfiles',
			entity: file,
			returnRepresentation: true,
			timeout: this.defaultRequestTimeout,
		};

		console.log(`[D365 API] Adding web file ${file.adx_name} to D365`);
		const requestResponse = await this.webApi.createRequest<ID365WebFile>(request);

		return requestResponse;
	}

	private async createNote(note: ID365Note, webfileId: string): Promise<ID365Note> {
		const select = NOTE_SELECT;
		const noteToCreate: any = {
			filename: note.filename,
			isdocument: note.isdocument,
			documentbody: note.documentbody,
			mimetype: note.mimetype,
			'objectid_adx_webfile@odata.bind': `adx_webfiles(${webfileId})`,
		};
		const request: CreateRequest = {
			collection: 'annotations',
			entity: noteToCreate,
			returnRepresentation: true,
			timeout: this.defaultRequestTimeout,
		};

		console.log(`[D365 API] Adding note ${noteToCreate.filename} to D365`);
		const requestResponse = await this.webApi.createRequest<ID365Note>(request);
		return requestResponse;
	}

	private getAdalConnection(): CrmAdalConnectionSettings {
		if (!this.configurationManager || !this.configurationManager.isConfigured) {
			throw Error('[D365 API] Configuration was not done');
		}

		const adal = new CrmAdalConnectionSettings(this.configurationManager);
		return adal;
	}

	private addStandardFilters(filterInactive: boolean, lastModified: string | undefined, request: RetrieveMultipleRequest) {
		if (filterInactive) {
			request.filter += ' and statecode eq 0';
		}

		if (lastModified) {
			request.filter += ` and modifiedon ge '${lastModified}'`;
		}
	}
}
