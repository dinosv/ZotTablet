/**
 * ZotTablet - Annotation Extractor Module
 * Extracts annotations from PDFs using Zotero's native PDFWorker
 *
 * Compatible with Zotero 7 (Firefox 115) and Zotero 8 (Firefox 140)
 *
 * This module uses Zotero's built-in PDFWorker to import external annotations
 * (made by other PDF readers) into Zotero's annotation system.
 */

Zotero.ZotTablet.AnnotationExtractorModule = new function() {
    const ZT = Zotero.ZotTablet;
    const C = Zotero.ZotTablet.Constants;

    /**
     * Initialize the annotation extractor
     */
    this.init = async function() {
        Zotero.debug('ZotTablet AnnotationExtractor: Initialized');
    };

    /**
     * Shutdown the annotation extractor
     */
    this.shutdown = function() {
        Zotero.debug('ZotTablet AnnotationExtractor: Shutdown');
    };

    // ==================== Main Extraction ====================

    /**
     * Extract annotations from attachments using Zotero's PDFWorker
     * @param {Zotero.Item[]} attachments - PDF attachments to extract from
     */
    this.extractAnnotations = async function(attachments) {
        const infoWindowDuration = ZT.getPref('infoWindowDuration') || 4000;
        const progressWin = ZT.showProgress('Extracting Annotations');

        let processedCount = 0;
        let annotationCount = 0;
        const errors = [];

        for (const attachment of attachments) {
            try {
                if (attachment.attachmentContentType !== 'application/pdf') {
                    continue;
                }

                const filePath = await attachment.getFilePathAsync();
                if (!filePath || !(await ZT.fileExists(filePath))) {
                    errors.push(ZT.createError(attachment, 'File not found', C.ERROR_CODES.FILE_NOT_FOUND));
                    continue;
                }

                progressWin.changeHeadline(`Extracting Annotations (${processedCount + 1}/${attachments.length})`);

                Zotero.debug(`ZotTablet: Extracting annotations from ${attachment.attachmentFilename}`);

                // Count existing external annotations before import
                const existingAnnotations = attachment.getAnnotations()
                    .filter(a => a.annotationIsExternal);
                const beforeCount = existingAnnotations.length;

                // Use Zotero's PDFWorker to import external annotations
                const hasChanges = await Zotero.PDFWorker.import(
                    attachment.id,
                    true,  // isPriority
                    '',    // password (empty string, not null)
                    false  // transfer - keep as external for now
                );

                // Count annotations after import
                const afterAnnotations = attachment.getAnnotations()
                    .filter(a => a.annotationIsExternal);
                const newCount = afterAnnotations.length - beforeCount;

                if (hasChanges || newCount > 0) {
                    processedCount++;
                    annotationCount += Math.max(0, newCount);
                }

            } catch (e) {
                Zotero.logError(e);
                errors.push(ZT.createError(attachment, e, C.ERROR_CODES.EXTRACTION_FAILED));
            }
        }

        // Build result message
        let message = '';
        if (processedCount > 0) {
            message = `Processed ${processedCount} file(s)`;
            if (annotationCount > 0) {
                message += `, found ${annotationCount} new annotation(s)`;
            }
        } else {
            message = 'No new annotations found';
        }

        if (errors.length > 0) {
            message += ' ' + ZT.formatErrorSummary(errors);
        }

        progressWin.addDescription(message);
        progressWin.startCloseTimer(infoWindowDuration);
    };

    /**
     * Extract annotations and create a note from them
     * This is an alternative that creates a Zotero note with the annotation content
     * @param {Zotero.Item[]} attachments - PDF attachments to extract from
     */
    this.extractAnnotationsToNote = async function(attachments) {
        const progressWin = ZT.showProgress('Extracting Annotations to Note');

        for (const attachment of attachments) {
            try {
                if (attachment.attachmentContentType !== 'application/pdf') {
                    continue;
                }

                // First, import external annotations
                await Zotero.PDFWorker.import(attachment.id, true, '', false);

                // Get all annotations
                const annotations = attachment.getAnnotations();

                if (annotations.length === 0) {
                    const progress = new progressWin.ItemProgress(
                        'chrome://zotero/skin/cross.png',
                        `${attachment.attachmentFilename}: No annotations`
                    );
                    progress.setProgress(100);
                    continue;
                }

                // Get parent item
                const parent = Zotero.Items.get(attachment.parentItemID);
                if (!parent) continue;

                // Build note content
                const date = new Date().toLocaleDateString();
                let noteContent = `<h1>Annotations from ${attachment.attachmentFilename}</h1>`;
                noteContent += `<p><em>Extracted on ${date}</em></p>`;

                // Sort annotations by page
                annotations.sort((a, b) => {
                    const pageA = parseInt(a.annotationPageLabel) || 0;
                    const pageB = parseInt(b.annotationPageLabel) || 0;
                    return pageA - pageB;
                });

                let currentPage = null;

                for (const ann of annotations) {
                    const page = ann.annotationPageLabel || '?';
                    const type = ann.annotationType;
                    const text = ann.annotationText || '';
                    const comment = ann.annotationComment || '';
                    const color = ann.annotationColor || '#FFFF00';

                    // Add page header if page changed
                    if (page !== currentPage) {
                        noteContent += `<h2>Page ${page}</h2>`;
                        currentPage = page;
                    }

                    // Format based on annotation type
                    if (type === 'highlight' && text) {
                        noteContent += `<blockquote style="border-left: 3px solid ${color}; padding-left: 10px;">`;
                        noteContent += `<p>"${this._escapeHtml(text)}"</p>`;
                        noteContent += `</blockquote>`;
                    }

                    if (comment) {
                        noteContent += `<p><strong>Note:</strong> ${this._escapeHtml(comment)}</p>`;
                    }

                    if (type === 'note' && !text && comment) {
                        // Sticky note with only comment
                        noteContent += `<p style="background: ${color}20; padding: 5px;">`;
                        noteContent += `<em>${this._escapeHtml(comment)}</em>`;
                        noteContent += `</p>`;
                    }
                }

                // Create note item
                const note = new Zotero.Item('note');
                note.libraryID = parent.libraryID;
                note.parentKey = parent.key;
                note.setNote(noteContent);
                await note.saveTx();

                const progress = new progressWin.ItemProgress(
                    'chrome://zotero/skin/treeitem-attachment-pdf.png',
                    `${attachment.attachmentFilename}: ${annotations.length} annotations`
                );
                progress.setProgress(100);

            } catch (e) {
                Zotero.logError(e);
                const progress = new progressWin.ItemProgress(
                    'chrome://zotero/skin/cross.png',
                    `Error: ${attachment.attachmentFilename}`
                );
                progress.setProgress(100);
            }
        }

        progressWin.startCloseTimer(ZT.getPref('infoWindowDuration') || 4000);
    };

    /**
     * Check if a PDF has external annotations that haven't been imported
     * @param {Zotero.Item} attachment - PDF attachment to check
     * @returns {boolean} - True if there are unimported annotations
     */
    this.hasExternalAnnotations = async function(attachment) {
        try {
            if (attachment.attachmentContentType !== 'application/pdf') {
                return false;
            }

            // Use PDFWorker to check for annotations
            return await Zotero.PDFWorker.hasAnnotations(attachment.id, true, '');
        } catch (e) {
            Zotero.debug(`ZotTablet: Error checking annotations: ${e.message}`);
            return false;
        }
    };

    // ==================== Helper Functions ====================

    /**
     * Escape HTML special characters
     */
    this._escapeHtml = function(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
};
