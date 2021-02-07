import { ID365Webpage } from "./interfaces/d365Webpage";

export class WebPage {

	public parent: WebPage | undefined;
	public parentId: string | undefined;
	public url: string;
	public id: string;
	public name: string;

	constructor(d365WebPage: ID365Webpage) {
		this.id = d365WebPage.adx_webpageid;
		this.url = d365WebPage.adx_partialurl;
		this.name = d365WebPage.adx_name;
		this.parentId = d365WebPage._adx_parentpageid_value;
	}

	public getFullPath(): string {
		// no parent left. Return name
		if (!this.parent) {
			return '';
		}

		return this.parent.getFullPath() + '/' + this.url;
	}

	public static createWebPageHierachy(d365WebPages: Map<string, ID365Webpage>): Map<string, WebPage> {
		const createdPages: Map<string, WebPage> = new Map<string, WebPage>();
	
		// create intial web pages
		for (const d365WebPage of d365WebPages.values()) {
			createdPages.set(d365WebPage.adx_webpageid, new WebPage(d365WebPage));
		}
	
		// build page hierachy
		for (const webPage of createdPages.values()) {
			// skip page. Page has no parent
			if (!webPage.parentId) {
				continue;
			}
	
			// web page has parent but we couldn't find it
			if (!createdPages.has(webPage.parentId)) {
				console.warn(`Couldn't resolve parent for page ${webPage.name}. Parent Id: ${webPage.parentId}`);
				continue;
			}
			webPage.parent = createdPages.get(webPage.parentId);
		}
	
		return createdPages;
	}
}