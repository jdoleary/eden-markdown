import * as path from "https://deno.land/std@0.177.0/path/mod.ts";
import { Config, TableOfContents, TableOfContentsEntry, tableOfContentsURL } from "../sharedTypes.ts";
import { Backlinks } from "../tool/backlinkFinder.ts";
import { absoluteOsMdPathToWebPath, pathOSAbsolute } from "../path.ts";

// Takes a string that contains html with template designators (e.g. {{content}}) and fills all the templates
export async function addContentsToTemplate(content: string, templateHtml: string, { config, tableOfContents, filePath, relativePath, titleOverride, metadata, backlinks }: {
    config: Config, tableOfContents: TableOfContents, filePath: string, relativePath: string, titleOverride: string, metadata: any, backlinks: Backlinks
}): Promise<string> {
    const pageTitle = (relativePath.split('\\').slice(-1)[0] || '').replaceAll('.md', '');
    // The wrapping div separates the text from the nextPrev buttons so the buttons can be
    // at the bottom of the page
    if (titleOverride) {
        content = `<div><h1>${titleOverride}</h1>${content}</div>`;
    }

    const templateReplacer = '{{content}}';

    // Add the template to the front
    // TODO: Optimizable
    const [templateStart, templateEnd] = templateHtml.split(templateReplacer);
    content = (templateStart || '') + content + (templateEnd || '');
    // }
    const title = filePath.split(path.sep).slice(-1)[0];

    content = content.replace('{{title}}', `<title>${title}</title>`);
    let breadcrumbs = '';
    if (relativePath) {
        breadcrumbs = [`<a href="${tableOfContentsURL}"' class="nav-item">Home</a>`, ...relativePath.split(path.sep).map(currentPathStep => {
            const preUrl = relativePath.split(currentPathStep)[0];
            const url = path.join('/', preUrl, currentPathStep);
            if (currentPathStep == title) {
                // No breadcrumb for current title
                return '';
            }
            return `<a class="nav-item" href=${url}>${currentPathStep}</a>`;
        })].filter(x => !!x).join('<span class="center-dot">·</span>');
    }
    content = content.replace('{{breadcrumbs}}', breadcrumbs);
    const webPath = absoluteOsMdPathToWebPath(filePath, config.parseDir);
    const backlinkList = backlinks[webPath];
    if (backlinkList) {
        content = content.replace('{{backlinks}}', `<h4>Backlinks</h4>${backlinkList.map(({ text, from, backlinkName }) => `<div><a href="${from}#${backlinkName}">${text}</a></div>`).join('')}`);
    } else {
        content = content.replace('{{backlinks}}', '');
    }
    // Add footer "next" and "prev" buttons
    const currentPage = tableOfContents.find(x => x.pageName == pageTitle);
    const currentIndex = currentPage ? tableOfContents.indexOf(currentPage) : -1;
    let pagination = '';
    if (currentIndex !== -1) {
        const previous = tableOfContents[currentIndex - 1];
        pagination += `<div class="pagination flex space-between">`;
        // Add next and previous buttons to page
        // If other page is in a different chapter, show the chapter before a ":"
        pagination += `${(previous && previous.pageName)
            ? `<a class="nextPrevButtons" href="\\${previous.relativePath}">← ${previous.parentDir !== currentPage?.parentDir
                ? path.parse(previous.parentDir || '').name + ':'
                : ''} ${previous.pageName}</a>`
            : `<a class="nextPrevButtons ${titleOverride == 'Table of Contents' ? 'hidden' : ''}" href="${tableOfContentsURL}">Table of Contents</a>`}`;
        // Add pageNumber
        pagination += `<div class="pageNumber"><a href="${tableOfContentsURL}">${currentIndex + 1}</a></div>`;
        const next = tableOfContents[currentIndex + 1];
        pagination += `${next ? `<a class="nextPrevButtons" href="\\${next.relativePath}">${next.pageName} →</a>` : ''}`;
        pagination += `</div>`;
    }
    content = content.replace('{{pagination}}', pagination);

    // {{ metadata  }} has spaces due to formatter changing it
    // TODO find a better way to add this to the head rather than replace
    content = content.replace('{{ metadata }}', JSON.stringify(metadata) || '{}');


    // Get file meta data
    try {
        const metadata = await Deno.stat(path.join(config.parseDir, relativePath));
        if (metadata.birthtime) {
            content = content.replace('{{created}}', metadata.birthtime?.toLocaleDateString() || '');
            const tocEntry = findTOCEntryFromFilepath(tableOfContents, filePath);
            if (tocEntry) {
                tocEntry.createdAt = metadata.birthtime;
            }
        }
        content = content.replace('{{modified}}', metadata.mtime?.toLocaleDateString() || '');
    } catch (e) {
        console.error('❌ Err: Failed to get metadata for ', filePath);
    }

    return content;

}

export function findTOCEntryFromFilepath(tableOfContents: TableOfContents, filePath: pathOSAbsolute): TableOfContentsEntry | undefined {
    const normalizedPath = path.normalize(filePath);
    return tableOfContents.find(entry => (entry.originalFilePath || '') === normalizedPath);

}