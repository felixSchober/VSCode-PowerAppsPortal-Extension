var dynamicsWebApi = require('dynamics-web-api');
import { CreateRequest, DeleteRequest, RetrieveMultipleRequest, RetrieveRequest, UpdateRequest } from 'dynamics-web-api';
import { ConfigurationManager } from '../configuration/configurationManager';
import { ContentSnippet } from '../models/ContentSnippet';
import { CONTENTSNIPPET_SELECT, ID365ContentSnippet } from '../models/interfaces/d365ContentSnippet';
import { ID365Note } from '../models/interfaces/d365Note';
import { ID365PublishingState } from '../models/interfaces/d365PublishingState';
import { ID365WebFile } from '../models/interfaces/d365WebFile';
import { ID365Webpage } from '../models/interfaces/d365Webpage';
import { ID365Website } from '../models/interfaces/d365Website';
import { ID365WebTemplate, WEBTEMPLATE_SELECT } from '../models/interfaces/d365WebTemplate';
import { Language } from '../models/Language';
import { WebFile } from '../models/WebFile';
import { WebTemplate } from '../models/WebTemplate';
import { CrmAdalConnectionSettings } from './adalConnection';

export class DynamicsApi {
	private webApi: DynamicsWebApi;

	d365InstanceName: string | undefined;
	d365CrmRegion: string | undefined;
	private configurationManager: ConfigurationManager;

	constructor(configurationManager: ConfigurationManager) {
		this.configurationManager = configurationManager;
		const adalConnect = this.getAdalConnection();

		this.d365InstanceName = this.configurationManager.d365InstanceName;
		this.d365CrmRegion = this.configurationManager.d365CrmRegion;

		const webApiUrl = `https://${this.d365InstanceName}.${this.d365CrmRegion}.dynamics.com/api/data/v9.1/`;
		this.webApi = new dynamicsWebApi({
			webApiUrl: webApiUrl,
			onTokenRefresh: (callback: any) => adalConnect.aquireToken(callback),
		});
	}

	public async getLanguage(languageCode: string): Promise<Language> {
		const select = ['languagelocaleid', 'code'];
		const filter = `code eq '${languageCode}'`;
		const response = await this.webApi.retrieveMultiple<Language>('languagelocale', select, filter);

		if (!response || !response.value || response.value?.length < 1) {
			throw Error('Could not get language from Dynamics instance with code eq ' + languageCode);
		}

		const result = response.value[0];
		return result;
	}

	public async getPortals(): Promise<Map<string, string>> {
		const result = new Map<string, string>();

		const request: RetrieveMultipleRequest = {
			select: ['adx_websiteid', 'adx_name'],
			collection: 'adx_websites',
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
		const select = ['adx_websiteid'];
		const filter = `adx_name eq '${portalName}'`;

		const response = await this.webApi.retrieveMultiple<ID365Website>('adx_websites', select, filter);

		if (response.value?.length !== 1) {
			throw Error(
				`Found either no portal with the name ${portalName} or too many (result set: ${response.value?.length})`
			);
		}
		const result = response.value[0].adx_websiteid;
		return result;
	}

	public async getWebpageId(name: string, portalId: string): Promise<string> {
		const select = ['adx_webpageid'];
		const filter = `_adx_websiteid_value eq ${portalId} and adx_name eq '${name}' and adx_isroot eq true`;

		const response = await this.webApi.retrieveMultiple<ID365Webpage>('adx_webpages', select, filter);

		if (response.value?.length !== 1) {
			throw Error(
				`Found either no webpage with the name ${name} or too many (result set: ${response.value?.length}). filter: ${filter}`
			);
		}
		const result = response.value[0].adx_webpageid;
		return result;
	}

	public async getPublishedPublishStateId(portalId: string): Promise<string> {
		const select = ['adx_publishingstateid'];
		const filter = `_adx_websiteid_value eq ${portalId} and adx_name eq 'Published'`;

		const response = await this.webApi.retrieveMultiple<ID365PublishingState>(
			'adx_publishingstates',
			select,
			filter
		);
		if (!response || !response.value || response.value.length < 1) {
			throw Error(`Found no publishing state for portal with id ${portalId}. Filter expression: ${filter}`);
		}

		const result = response.value[0].adx_publishingstateid;
		return result;
	}

	public async getContentSnippets(websiteId: string): Promise<Array<ContentSnippet>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_contentsnippets',
			select: CONTENTSNIPPET_SELECT,
			filter: '_adx_websiteid_value eq ' + websiteId,
		};
		const response = await this.webApi.retrieveAllRequest<ID365ContentSnippet>(request);
		if (!response.value || response.value?.length === 0) {
			throw Error(`Could not get content snippets from dynamics instance for website with id ${websiteId}.`);
		}

		return response.value.map(
			(c) =>
				new ContentSnippet(
					c.adx_value,
					c._adx_contentsnippetlanguageid_value,
					c.versionnumber,
					c.adx_contentsnippetid,
					c.adx_name
				)
		);
	}

	public async updateContentSnippet(update: ContentSnippet): Promise<ContentSnippet> {
		const request: UpdateRequest = {
			collection: 'adx_contentsnippets',
			key: update.id,
			returnRepresentation: true,
			select: CONTENTSNIPPET_SELECT,
			entity: {
				adx_value: update.source
			}
		};

		const c = await this.webApi.updateRequest<ID365ContentSnippet>(request);
		return new ContentSnippet(
			c.adx_value,
			c._adx_contentsnippetlanguageid_value,
			c.versionnumber,
			c.adx_contentsnippetid,
			c.adx_name
		);
	}

	public async addContentSnippet(newSnippet: ID365ContentSnippet): Promise<ContentSnippet> {
		const request: CreateRequest = {
			collection: 'adx_contentsnippets',
			entity: newSnippet,
			returnRepresentation: true
		};

		const c = await this.webApi.createRequest<ID365ContentSnippet>(request);
		return new ContentSnippet(
			c.adx_value,
			c._adx_contentsnippetlanguageid_value,
			c.versionnumber,
			c.adx_contentsnippetid,
			c.adx_name
		);
	}

	public async deleteContentSnippet(id: string): Promise<void> {
		const request: DeleteRequest = {
			collection: 'adx_contentsnippets',
			key: id
		};
		await this.webApi.deleteRequest(request);
	}

	public async getWebTemplates(websiteId: string): Promise<Array<WebTemplate>> {
		const request: RetrieveMultipleRequest = {
			collection: 'adx_webtemplates',
			select: WEBTEMPLATE_SELECT,
			filter: '_adx_websiteid_value eq ' + websiteId,
		};

		const response = await this.webApi.retrieveAllRequest<ID365WebTemplate>(request);
		if (!response.value || response.value?.length === 0) {
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
				adx_source: update.source
			}
		};

		const result = await this.webApi.updateRequest<ID365WebTemplate>(request);
		return new WebTemplate(result);
	}

	public async addWebTemplate(newTemplate: ID365WebTemplate): Promise<WebTemplate> {
		const request: CreateRequest = {
			collection: 'adx_webtemplates',
			entity: newTemplate,
			returnRepresentation: true
		};

		const result = await this.webApi.createRequest<ID365WebTemplate>(request);
		return new WebTemplate(result);
	}

	public async deleteWebTemplate(templateId: string): Promise<void> {
		const request: DeleteRequest = {
			collection: 'adx_webtemplates',
			key: templateId
		};
		await this.webApi.deleteRequest(request);
	}

	public async getWebFiles(portalId: string): Promise<Array<WebFile>> {
		const select = ['adx_webfileid', 'adx_name', 'adx_partialurl', '_adx_websiteid_value'];
		const filter = '_adx_websiteid_value eq ' + portalId;

		console.log('[D365 API] Getting web file');
		const response = await this.webApi.retrieveMultiple<ID365WebFile>('adx_webfiles', select, filter);
		if (!response.value) {
			console.error("[D365 API] Could't get web files. Reponse value was empty.");
			return [];
		}

		console.log('[D365 API] Getting web file notes');
		const webFileNotes = await this.getWebFileNotes();

		// create a map out of the web file notes with the key being the id of the corresponding webfile id.
		const webFileNotesMap = new Map<string, ID365Note>(webFileNotes.map((note) => [note._objectid_value, note]));

		let result: Array<WebFile> = [];
		
		for (const webFile of response.value) {
			if (!webFile.adx_webfileid) {
				throw Error(`Could not get web file with name ${webFile.adx_name} because id was undefined.`);
			}
			// get corresponding note
			const note = webFileNotesMap.get(webFile.adx_webfileid);

			if (!note) {
				console.warn(`Could not get file contents for web file with id ${webFile.adx_webfileid} and name ${webFile.adx_name}`);
				continue;
			}

			result.push(new WebFile(webFile, note));
		}
		
		return result;
	}

	public async getWebFileNotes(): Promise<Array<ID365Note>> {
		const request: RetrieveMultipleRequest = {
			collection: 'annotations',
			filter: "objecttypecode eq 'adx_webfile' and isdocument eq true",
			select: ['annotationid', 'filename', 'isdocument', 'documentbody', 'filesize', 'versionnumber', '_objectid_value'],
		};

		const response = await this.webApi.retrieveAllRequest<ID365Note>(request);

		if (!response.value) {
			return [];
		}
		return response.value;
	}

	public async uploadFiles(
		files: Array<ID365Note>,
		websiteId: string,
		parentPageId: string,
		publishingStateId: string
	): Promise<Array<ID365WebFile>> {
		const result: Array<ID365WebFile> = [];

		for (const note of files) {
			console.log(`\t[D365 API] Creating webfile ${note.filename}`);
			const file = await this.createWebFile(note.filename, websiteId, parentPageId, publishingStateId);

			if (!file.adx_webfileid) {
				throw Error(`[D365 API] Webfile for file ${note.filename} was not created successfully -> no id on obejct`);
			}

			console.log(`\t[D365 API] Uploading contents to webfile ${note.filename}. File Id: ${file.adx_webfileid}`);
			const createdNote = await this.createNote(note, file.adx_webfileid);

			console.log('\t[D365 API] Uploaded file: ' + createdNote.filename);

			result.push(file);
		}

		return result;
	}

	public async upateFiles(files: Array<ID365Note>): Promise<Array<ID365Note>> {
		const result: Array<ID365Note> = [];

		for (const f of files) {
			if (!f.annotationid) {
				throw Error(`[D365 API] Could not update file with name: ${f.filename}. Existing id was undefined.`);
			}

			const updatedImage: any = {
				documentbody: f.documentbody,
			};

			console.log(`\t[D365 API] Updating file ${f.filename} to D365`);
			await this.webApi.update<boolean>(f.annotationid, 'annotations', updatedImage);
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

		console.log(`[D365 API] Adding web file ${file.adx_name} to D365`);
		const requestResponse = await this.webApi.create<ID365WebFile>(
			file,
			'adx_webfiles',
			['return=representation'],
			select
		);

		return requestResponse;
	}

	private async createNote(note: ID365Note, webfileId: string): Promise<ID365Note> {
		const select = ['annotationid', 'filename', 'isdocument'];
		const noteToCreate: any = {
			filename: note.filename,
			isdocument: note.isdocument,
			documentbody: note.documentbody,
			'objectid_adx_webfile@odata.bind': `adx_webfiles(${webfileId})`,
		};

		console.log(`[D365 API] Adding note ${noteToCreate.filename} to D365`);
		const requestResponse = await this.webApi.create<ID365Note>(
			noteToCreate,
			'annotations',
			['return=representation'],
			select
		);

		return requestResponse;
	}

	private getAdalConnection(): CrmAdalConnectionSettings {
		if (!this.configurationManager || !this.configurationManager.isConfigured) {
			throw Error('[D365 API] Configuration was not done');
		}

		const adal = new CrmAdalConnectionSettings(this.configurationManager);
		return adal;
	}
}
