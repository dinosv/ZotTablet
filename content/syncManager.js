/**
 * ZotTablet - Sync Manager Module
 * Handles file synchronization between Zotero and external folder
 *
 * Compatible with Zotero 7 (Firefox 115) and Zotero 8 (Firefox 140)
 */

Zotero.ZotTablet.SyncManagerModule = new function() {
    const ZT = Zotero.ZotTablet;

    // Mode constants - reference centralised values
    const C = Zotero.ZotTablet.Constants;
    this.MODE_BACKGROUND = C.MODE.BACKGROUND;
    this.MODE_FOREGROUND = C.MODE.FOREGROUND;

    /**
     * Initialize the sync manager
     */
    this.init = async function() {
        Zotero.debug('ZotTablet SyncManager: Initialized');
    };

    /**
     * Shutdown the sync manager
     */
    this.shutdown = function() {
        Zotero.debug('ZotTablet SyncManager: Shutdown');
    };

    // ==================== Tag Management ====================

    /**
     * Get tablet tags
     */
    this.getTags = function() {
        return {
            onTablet: ZT.getPref('tagOnTablet') || '_tablet',
            modified: ZT.getPref('tagModified') || '_tablet_modified'
        };
    };

    // ==================== Validation ====================

    /**
     * Validate and filter attachments for send operation
     * @param {Zotero.Item[]} attachments - Attachments to validate
     * @returns {{ valid: Zotero.Item[], invalid: Array }} Valid items and reasons for invalid
     */
    this.validateForSend = function(attachments) {
        const valid = [];
        const invalid = [];

        for (const att of attachments) {
            if (!att.isAttachment() || att.isTopLevelItem()) {
                invalid.push({ item: att, reason: 'Not a child attachment' });
                continue;
            }
            if (!ZT.checkFileType(att)) {
                invalid.push({ item: att, reason: 'Not a PDF' });
                continue;
            }
            if (this.isOnTablet(att)) {
                invalid.push({ item: att, reason: 'Already on tablet' });
                continue;
            }
            valid.push(att);
        }

        return { valid, invalid };
    };

    /**
     * Validate attachments for get operation
     * @param {Zotero.Item[]} attachments - Attachments to validate
     * @returns {{ valid: Zotero.Item[], invalid: Array }}
     */
    this.validateForGet = function(attachments) {
        const valid = [];
        const invalid = [];

        for (const att of attachments) {
            if (!this.isOnTablet(att)) {
                invalid.push({ item: att, reason: 'Not on tablet' });
                continue;
            }
            valid.push(att);
        }

        return { valid, invalid };
    };

    /**
     * Check if batch confirmation is needed
     * @param {number} count - Number of items
     * @returns {boolean}
     */
    this.needsBatchConfirmation = function(count) {
        return ZT.getPref('confirmBatch') && count >= ZT.getPref('batchThreshold');
    };

    /**
     * Add tablet tag to attachment and parent
     */
    this.addTabletTag = async function(attachment, tag) {
        const tags = this.getTags();
        const otherTag = tag === tags.onTablet ? tags.modified : tags.onTablet;

        // Add to attachment
        attachment.addTag(tag);
        attachment.removeTag(otherTag);

        // Add to parent
        const parent = Zotero.Items.get(attachment.parentItemID);
        if (parent) {
            parent.addTag(tag);
            // Only remove other tag if no other attachment has it
            const siblings = Zotero.Items.get(parent.getAttachments());
            if (!siblings.some(att => att.id !== attachment.id && att.hasTag(otherTag))) {
                parent.removeTag(otherTag);
            }
            await parent.saveTx();
        }

        await attachment.saveTx();
    };

    /**
     * Remove tablet tag from attachment and parent
     */
    this.removeTabletTag = async function(attachment, tag) {
        attachment.removeTag(tag);

        const parent = Zotero.Items.get(attachment.parentItemID);
        if (parent && parent.hasTag(tag)) {
            const siblings = Zotero.Items.get(parent.getAttachments());
            if (!siblings.some(att => att.id !== attachment.id && att.hasTag(tag))) {
                parent.removeTag(tag);
            }
            await parent.saveTx();
        }

        await attachment.saveTx();
    };

    // ==================== Tablet Info Storage ====================

    /**
     * Store tablet info in attachment note
     */
    this.setTabletInfo = function(attachment, info) {
        const content = attachment.getNote() || '';

        // Parse existing content
        const parser = new DOMParser();
        const doc = parser.parseFromString(content || '<html><body></body></html>', 'text/html');

        // Find or create zottablet data element
        let dataEl = doc.querySelector('#zottablet-data');
        if (!dataEl) {
            dataEl = doc.createElement('p');
            dataEl.id = 'zottablet-data';
            dataEl.style.color = '#cccccc';
            dataEl.style.fontSize = '10px';
            dataEl.textContent = '(ZotTablet sync data)';
            doc.body.appendChild(dataEl);
        }

        // Store info as data attribute
        dataEl.setAttribute('data-zottablet', JSON.stringify(info));

        attachment.setNote(doc.body.innerHTML);
    };

    /**
     * Get tablet info from attachment note
     */
    this.getTabletInfo = function(attachment) {
        const content = attachment.getNote() || '';
        if (!content) return null;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const dataEl = doc.querySelector('#zottablet-data');

            if (dataEl) {
                const data = dataEl.getAttribute('data-zottablet');
                if (data) {
                    const info = JSON.parse(data);
                    // Resolve base folder placeholder
                    if (info.location) {
                        let destDir = ZT.getPref('destDir') || '';
                        // Remove trailing slash from destDir to avoid double slashes
                        destDir = destDir.replace(/[\/\\]+$/, '');
                        info.location = info.location.replace('[BaseFolder]', destDir);
                        Zotero.debug(`ZotTablet: getTabletInfo - resolved location: ${info.location}`);
                    }
                    return info;
                }
            }
        } catch (e) {
            Zotero.logError(e);
        }

        return null;
    };

    /**
     * Clear tablet info from attachment note
     */
    this.clearTabletInfo = function(attachment) {
        const content = attachment.getNote() || '';
        if (!content) return;

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, 'text/html');
            const dataEl = doc.querySelector('#zottablet-data');

            if (dataEl) {
                dataEl.remove();
                attachment.setNote(doc.body.innerHTML);
            }
        } catch (e) {
            Zotero.logError(e);
        }
    };

    // ==================== Status Checks ====================

    /**
     * Check if attachment is on tablet
     */
    this.isOnTablet = function(attachment) {
        const tags = this.getTags();
        return attachment.hasTag(tags.onTablet) || attachment.hasTag(tags.modified);
    };

    /**
     * Check if tablet file was modified
     */
    this.isModified = async function(attachment) {
        if (!this.isOnTablet(attachment)) return false;

        const info = this.getTabletInfo(attachment);
        if (!info || !info.location) return false;

        // Check if file exists using ZT wrapper
        if (!(await ZT.fileExists(info.location))) return false;

        // Compare modification times
        const currentModTime = await ZT.getFileModTime(info.location);
        return currentModTime > info.lastmod;
    };

    /**
     * Get tablet file path
     */
    this.getTabletFilePath = async function(attachment) {
        const info = this.getTabletInfo(attachment);
        if (!info) return null;

        // Foreground mode: file is at attachment location
        if (info.mode === this.MODE_FOREGROUND) {
            return await attachment.getFilePathAsync();
        }

        // Background mode: file is at stored location
        if (info.location && await ZT.fileExists(info.location)) {
            return info.location;
        }

        return null;
    };

    // ==================== Send to Tablet ====================

    /**
     * Send attachments to tablet folder
     * Uses parallel processing for file operations, sequential for DB operations
     * @param {Zotero.Item[]} attachments - Attachments to send
     * @param {string} projectFolder - Optional project subfolder
     */
    this.sendToTablet = async function(attachments, projectFolder = '') {
        // Cache all preferences at start
        const prefs = {
            destDir: ZT.getPref('destDir'),
            mode: ZT.getPref('mode') || this.MODE_BACKGROUND,
            rename: ZT.getPref('rename'),
            subfolder: ZT.getPref('subfolder'),
            subfolderFormat: ZT.getPref('subfolderFormat') || '',
            infoWindowDuration: ZT.getPref('infoWindowDuration')
        };

        if (!prefs.destDir) {
            ZT.showInfo('Error', 'Please set the destination folder in preferences');
            return;
        }

        const progressWin = ZT.showProgress('Sending to Tablet');
        const tags = this.getTags();
        const self = this;

        // Filter valid attachments first
        const validAttachments = attachments.filter(att =>
            att.isAttachment() && !att.isTopLevelItem()
        );

        if (validAttachments.length === 0) {
            progressWin.addDescription('No valid attachments to process');
            progressWin.startCloseTimer(prefs.infoWindowDuration);
            return;
        }

        // Define per-item file processor (parallelizable)
        const processFile = async (attachment) => {
            const sourcePath = await attachment.getFilePathAsync();
            if (!sourcePath || !(await ZT.fileExists(sourcePath))) {
                throw new Error('Source file not found');
            }

            // Get parent item for metadata
            const parent = Zotero.Items.get(attachment.parentItemID);

            // Determine filename
            let filename = attachment.attachmentFilename;
            if (prefs.rename && parent) {
                filename = self._formatFilename(parent, filename);
            }

            // Determine destination path
            let targetDir = prefs.destDir;
            if (projectFolder) {
                targetDir = ZT.joinPath(prefs.destDir, projectFolder);
            }
            if (prefs.subfolder && parent) {
                const subfolder = self._formatSubfolder(parent, prefs.subfolderFormat);
                targetDir = ZT.joinPath(targetDir, subfolder);
            }

            const targetPath = ZT.joinPath(targetDir, filename);

            // Ensure directory exists
            await ZT.ensureDirectory(targetDir);

            let finalPath;

            if (prefs.mode === self.MODE_BACKGROUND) {
                // Background mode: copy file
                finalPath = await ZT.copyFile(sourcePath, targetPath);
            } else {
                // Foreground mode: move file and relink
                finalPath = await ZT.moveFile(sourcePath, targetPath);
                await attachment.relinkAttachmentFile(finalPath);
            }

            // Get modification time for tablet info
            const modTime = await ZT.getFileModTime(finalPath);

            return {
                attachment,
                finalPath,
                modTime,
                filename
            };
        };

        // Process files in parallel (max 3 concurrent)
        const { successes, errors } = await ZT.processInBatches(
            validAttachments,
            processFile,
            {
                concurrency: 3,
                onProgress: (done, total) => {
                    progressWin.changeHeadline(`Sending to Tablet (${done}/${total})`);
                }
            }
        );

        // Sequential DB operations for successful files
        for (const result of successes) {
            try {
                // Store tablet info
                this.setTabletInfo(result.attachment, {
                    location: result.finalPath.replace(prefs.destDir, '[BaseFolder]'),
                    lastmod: result.modTime,
                    mode: prefs.mode,
                    projectFolder: projectFolder
                });

                // Add tablet tag
                await this.addTabletTag(result.attachment, tags.onTablet);
            } catch (e) {
                Zotero.logError(e);
                errors.push(ZT.createError(result.attachment, e, C.ERROR_CODES.UNKNOWN));
            }
        }

        // Build result message
        let message = `Sent ${successes.length} file(s) to tablet`;
        if (errors.length > 0) {
            message += ' ' + ZT.formatErrorSummary(errors);
        }

        progressWin.addDescription(message);
        progressWin.startCloseTimer(prefs.infoWindowDuration);
    };

    // ==================== Get from Tablet ====================

    /**
     * Get attachments from tablet folder back to Zotero
     * Uses parallel processing for file operations, sequential for DB and conflict resolution
     * @param {Zotero.Item[]} attachments - Attachments to retrieve
     * @param {boolean} extractAnnotationsFlag - Whether to extract annotations
     */
    this.getFromTablet = async function(attachments, extractAnnotationsFlag = true) {
        Zotero.debug(`ZotTablet: getFromTablet called with ${attachments.length} attachment(s)`);

        // Cache preferences at start
        const prefs = {
            destDir: ZT.getPref('destDir'),
            extractOnSync: ZT.getPref('extractOnSync'),
            infoWindowDuration: ZT.getPref('infoWindowDuration')
        };

        const progressWin = ZT.showProgress('Getting from Tablet');
        const tags = this.getTags();
        const self = this;

        // Filter to attachments actually on tablet
        const tabletAttachments = attachments.filter(att => this.isOnTablet(att));

        if (tabletAttachments.length === 0) {
            progressWin.addDescription('No tablet attachments to process');
            progressWin.startCloseTimer(prefs.infoWindowDuration);
            return;
        }

        // First pass: gather file info in parallel (read-only operations)
        const gatherInfo = async (attachment) => {
            const info = self.getTabletInfo(attachment);
            if (!info) {
                return { skip: true, reason: 'no_info' };
            }

            const tabletPath = await self.getTabletFilePath(attachment);
            if (!tabletPath) {
                return { skip: true, reason: 'no_file', attachment, needsCleanup: true };
            }

            const zoteroPath = await attachment.getFilePathAsync();
            const tabletModTime = await ZT.getFileModTime(tabletPath);
            const zoteroModTime = zoteroPath ? await ZT.getFileModTime(zoteroPath) : 0;
            const savedModTime = info.lastmod || 0;

            const tabletModified = tabletModTime > savedModTime;
            const zoteroModified = zoteroModTime > savedModTime;

            return {
                attachment,
                info,
                tabletPath,
                zoteroPath,
                tabletModified,
                zoteroModified,
                hasConflict: tabletModified && zoteroModified
            };
        };

        // Gather info in parallel
        const { successes: infoResults, errors: gatherErrors } = await ZT.processInBatches(
            tabletAttachments,
            gatherInfo,
            {
                concurrency: 3,
                onProgress: (done, total) => {
                    progressWin.changeHeadline(`Checking files (${done}/${total})`);
                }
            }
        );

        // Separate results
        const toProcess = [];
        const toCleanup = [];
        const conflicts = [];

        for (const result of infoResults) {
            if (result.skip) {
                if (result.needsCleanup) {
                    toCleanup.push(result.attachment);
                }
                continue;
            }
            if (result.hasConflict) {
                conflicts.push(result);
            } else {
                toProcess.push(result);
            }
        }

        // Handle conflicts sequentially (requires user interaction)
        for (const conflict of conflicts) {
            const resolution = await this._resolveConflict(
                conflict.attachment,
                conflict.tabletPath,
                conflict.zoteroPath
            );
            if (resolution === 'tablet') {
                conflict.useTablet = true;
                toProcess.push(conflict);
            } else if (resolution === 'zotero') {
                conflict.useTablet = false;
                toProcess.push(conflict);
            }
            // 'cancel' - skip this file
        }

        // Process files in parallel
        const toExtract = [];
        const errors = [...gatherErrors];

        const processFile = async (item) => {
            const { attachment, info, tabletPath, zoteroPath, tabletModified, useTablet } = item;

            if (info.mode === self.MODE_BACKGROUND) {
                // Background mode: copy back if modified
                if (tabletModified || useTablet) {
                    await ZT.copyFile(tabletPath, zoteroPath, true);
                    return { attachment, shouldExtract: true, tabletPath };
                }
                return { attachment, shouldExtract: false, tabletPath };
            } else {
                // Foreground mode: move file back
                const originalDir = Zotero.getStorageDirectory().path;
                const originalPath = ZT.joinPath(
                    originalDir,
                    attachment.key,
                    attachment.attachmentFilename
                );

                await ZT.ensureDirectory(ZT.getParentDir(originalPath));
                await ZT.moveFile(tabletPath, originalPath);
                await attachment.relinkAttachmentFile(originalPath);

                return { attachment, shouldExtract: true, tabletPath: null };
            }
        };

        progressWin.changeHeadline(`Retrieving files...`);

        const { successes: fileResults, errors: fileErrors } = await ZT.processInBatches(
            toProcess,
            processFile,
            {
                concurrency: 3,
                onProgress: (done, total) => {
                    progressWin.changeHeadline(`Retrieving files (${done}/${total})`);
                }
            }
        );

        errors.push(...fileErrors);

        // Sequential: cleanup tablet files (file operations outside transaction)
        progressWin.changeHeadline(`Cleaning up files...`);

        const toSaveDB = [];
        for (const result of fileResults) {
            try {
                const { attachment, shouldExtract, tabletPath } = result;

                // Remove tablet file if it exists (background mode)
                if (tabletPath) {
                    await ZT.removeFile(tabletPath);
                    const tabletDir = ZT.getParentDir(tabletPath);
                    await ZT.removeEmptyDirs(tabletDir, prefs.destDir);
                }

                // Prepare DB updates (done in batch transaction below)
                await this.removeTabletTag(attachment, tags.onTablet);
                await this.removeTabletTag(attachment, tags.modified);
                this.clearTabletInfo(attachment);
                toSaveDB.push(attachment);

                if (shouldExtract) {
                    toExtract.push(attachment);
                }
            } catch (e) {
                Zotero.logError(e);
                errors.push(ZT.createError(result.attachment, e, C.ERROR_CODES.UNKNOWN));
            }
        }

        // Cleanup attachments where tablet file was missing
        for (const attachment of toCleanup) {
            try {
                await this.removeTabletTag(attachment, tags.onTablet);
                await this.removeTabletTag(attachment, tags.modified);
                this.clearTabletInfo(attachment);
                toSaveDB.push(attachment);
            } catch (e) {
                Zotero.logError(e);
            }
        }

        // Batch save all DB changes in single transaction
        if (toSaveDB.length > 0) {
            progressWin.changeHeadline(`Updating database...`);
            await Zotero.DB.executeTransaction(async () => {
                for (const item of toSaveDB) {
                    await item.save();
                }
            });
        }

        // Build result message
        const successCount = fileResults.length;
        let message = `Retrieved ${successCount} file(s) from tablet`;
        if (errors.length > 0) {
            message += ' ' + ZT.formatErrorSummary(errors);
        }

        progressWin.addDescription(message);
        progressWin.startCloseTimer(prefs.infoWindowDuration);

        // Extract annotations if enabled
        if (extractAnnotationsFlag && toExtract.length > 0 && prefs.extractOnSync) {
            await ZT.AnnotationExtractor.extractAnnotations(toExtract);
        }
    };

    // ==================== Check Modifications ====================

    /**
     * Check and update modification status for tablet attachments
     * Uses parallel processing for file checks, sequential for DB operations
     * @param {Zotero.Item[]} attachments - Attachments to check
     */
    this.checkModifications = async function(attachments) {
        const tags = this.getTags();
        const self = this;

        // Filter to tablet attachments
        const tabletAttachments = attachments.filter(att => this.isOnTablet(att));

        if (tabletAttachments.length === 0) {
            return 0;
        }

        // Check modification status in parallel
        const checkMod = async (attachment) => {
            const isModified = await self.isModified(attachment);
            const hasModifiedTag = attachment.hasTag(tags.modified);
            return {
                attachment,
                isModified,
                hasModifiedTag,
                needsUpdate: (isModified && !hasModifiedTag) || (!isModified && hasModifiedTag)
            };
        };

        const { successes: checkResults } = await ZT.processInBatches(
            tabletAttachments,
            checkMod,
            { concurrency: 3 }
        );

        // Sequential DB operations for items that need updates
        let modifiedCount = 0;
        for (const result of checkResults) {
            if (!result.needsUpdate) continue;

            try {
                if (result.isModified && !result.hasModifiedTag) {
                    await this.addTabletTag(result.attachment, tags.modified);
                    modifiedCount++;
                } else if (!result.isModified && result.hasModifiedTag) {
                    await this.addTabletTag(result.attachment, tags.onTablet);
                }
            } catch (e) {
                Zotero.logError(e);
            }
        }

        if (modifiedCount > 0) {
            ZT.showInfo('ZotTablet', `Found ${modifiedCount} modified file(s)`);
        }

        return modifiedCount;
    };

    /**
     * Get all attachments on tablet
     */
    this.getAttachmentsOnTablet = async function() {
        const tags = this.getTags();

        const search = new Zotero.Search();
        search.addCondition('itemType', 'is', 'attachment');
        search.addCondition('tag', 'contains', tags.onTablet);

        const ids = await search.search();
        return Zotero.Items.get(ids).filter(item =>
            item.isAttachment() && !item.isTopLevelItem()
        );
    };

    // ==================== Helper Functions ====================

    /**
     * Format filename based on parent item metadata
     */
    this._formatFilename = function(item, originalFilename) {
        // Get extension
        const ext = ZT.getFileExtension(originalFilename);

        // Simple format: Author_Year_Title
        const author = item.getCreator(0);
        const authorName = author ? (author.lastName || author.name || 'Unknown') : 'Unknown';
        const year = item.getField('date') ? item.getField('date').substring(0, 4) : 'NoYear';
        let title = item.getField('title') || 'Untitled';

        // Truncate title
        if (title.length > C.LIMITS.TITLE_TRUNCATE_LENGTH) {
            title = title.substring(0, C.LIMITS.TITLE_TRUNCATE_LENGTH);
        }

        // Clean filename
        let filename = `${authorName}_${year}_${title}`;
        filename = filename.replace(/[\/\\?*:|"<>]/g, '');
        filename = filename.replace(/\s+/g, '_');

        return `${filename}.${ext}`;
    };

    /**
     * Format subfolder based on item metadata
     */
    this._formatSubfolder = function(item, format) {
        if (!format) return '';

        let subfolder = format;

        // Replace wildcards
        const author = item.getCreator(0);
        const authorName = author ? (author.lastName || author.name || 'Unknown') : 'Unknown';
        const year = item.getField('date') ? item.getField('date').substring(0, 4) : 'NoYear';
        const journal = item.getField('publicationTitle') || 'NoJournal';

        subfolder = subfolder.replace(/%a/g, authorName);
        subfolder = subfolder.replace(/%y/g, year);
        subfolder = subfolder.replace(/%j/g, journal);

        // Clean path
        subfolder = subfolder.replace(/[?*:|"<>]/g, '');

        return subfolder;
    };

    /**
     * Resolve conflict when both files are modified
     */
    this._resolveConflict = async function(attachment, tabletPath, zoteroPath) {
        const prompts = Services.prompt;

        const flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
                      prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL +
                      prompts.BUTTON_POS_2 * prompts.BUTTON_TITLE_IS_STRING;

        const result = prompts.confirmEx(
            null,
            'File Conflict',
            `Both the tablet file and Zotero file for "${attachment.attachmentFilename}" have been modified.\n\nWhich version do you want to keep?`,
            flags,
            'Use Tablet Version',
            null,
            'Use Zotero Version',
            null,
            {}
        );

        // 0 = tablet, 1 = cancel, 2 = zotero
        if (result === 0) return 'tablet';
        if (result === 2) return 'zotero';
        return 'cancel';
    };
};
