/**
 * ZotTablet - Main Module
 * Plugin for Zotero 7/8 to manage PDFs for external reading
 *
 * Compatible with Zotero 7 (Firefox 115) and Zotero 8 (Firefox 140)
 */

// For Zotero 8+, use IOUtils and PathUtils (modern APIs)
// For Zotero 7, use OS.File shim
var OS, IOUtils, PathUtils;
try {
    // Try to get IOUtils and PathUtils (available in Zotero 8)
    IOUtils = globalThis.IOUtils || ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
    PathUtils = globalThis.PathUtils || ChromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs").PathUtils;
    Zotero.debug('ZotTablet: Using IOUtils/PathUtils (Zotero 8 mode)');
} catch (e) {
    Zotero.debug('ZotTablet: IOUtils not available, trying OS.File');
}

try {
    // Try OS.File shim for Zotero 7 compatibility
    OS = ChromeUtils.importESModule("chrome://zotero/content/osfile.mjs").OS;
} catch (e) {
    Zotero.debug('ZotTablet: OS.File not available');
}

Zotero.ZotTablet = new function() {
    // Plugin info
    this.id = null;
    this.version = null;
    this.rootURI = null;

    // Internal state
    this._initialized = false;
    this._notifierID = null;
    this._columnID = null;

    // Platform detection
    this.isZotero8 = false;

    // Submodules
    this.ReadingList = null;
    this.SyncManager = null;
    this.AnnotationExtractor = null;
    this.UI = null;

    /**
     * Initialize the plugin
     */
    this.init = async function({ id, version, rootURI }) {
        if (this._initialized) return;

        this.id = id;
        this.version = version;
        this.rootURI = rootURI;

        // Detect Zotero version
        this.isZotero8 = typeof Zotero.platformMajorVersion !== 'undefined' &&
                         Zotero.platformMajorVersion >= 140;

        Zotero.debug(`ZotTablet: Initializing (Zotero platform: ${Zotero.platformMajorVersion || 'unknown'})`);

        // Load submodules
        Services.scriptloader.loadSubScript(rootURI + "content/readingList.js");
        Services.scriptloader.loadSubScript(rootURI + "content/syncManager.js");
        Services.scriptloader.loadSubScript(rootURI + "content/annotationExtractor.js");
        Services.scriptloader.loadSubScript(rootURI + "content/ui.js");

        this.ReadingList = Zotero.ZotTablet.ReadingListModule;
        this.SyncManager = Zotero.ZotTablet.SyncManagerModule;
        this.AnnotationExtractor = Zotero.ZotTablet.AnnotationExtractorModule;
        this.UI = Zotero.ZotTablet.UIModule;

        // Initialize submodules
        await this.ReadingList.init();
        await this.SyncManager.init();
        await this.AnnotationExtractor.init();
        await this.UI.init();

        // Register notifier for item changes
        this._notifierID = Zotero.Notifier.registerObserver(
            this._notifierCallback,
            ['item'],
            'zottablet'
        );

        // Register custom column
        await this._registerColumn();

        this._initialized = true;
        Zotero.debug('ZotTablet: Initialized successfully');
    };

    /**
     * Shutdown the plugin
     */
    this.shutdown = function() {
        if (!this._initialized) return;

        // Unregister notifier
        if (this._notifierID) {
            Zotero.Notifier.unregisterObserver(this._notifierID);
            this._notifierID = null;
        }

        // Unregister column
        if (this._columnID) {
            try {
                Zotero.ItemTreeManager.unregisterColumn(this._columnID);
            } catch (e) {
                // Ignore errors during cleanup
            }
            this._columnID = null;
        }

        // Shutdown submodules
        if (this.UI) this.UI.shutdown();
        if (this.AnnotationExtractor) this.AnnotationExtractor.shutdown();
        if (this.SyncManager) this.SyncManager.shutdown();
        if (this.ReadingList) this.ReadingList.shutdown();

        this._initialized = false;
        Zotero.debug('ZotTablet: Shutdown');
    };

    /**
     * Called when main window loads
     */
    this.onMainWindowLoad = function(window) {
        if (this.UI) {
            this.UI.onMainWindowLoad(window);
        }
    };

    /**
     * Called when main window unloads
     */
    this.onMainWindowUnload = function(window) {
        if (this.UI) {
            this.UI.onMainWindowUnload(window);
        }
    };

    /**
     * Register custom column in item tree
     */
    this._registerColumn = async function() {
        try {
            this._columnID = await Zotero.ItemTreeManager.registerColumn({
                dataKey: 'zottablet-status',
                label: 'Tablet',
                pluginID: this.id,
                dataProvider: (item, dataKey) => {
                    return this.getItemStatus(item);
                },
                renderCell: (index, data, column) => {
                    const doc = Zotero.getMainWindow()?.document;
                    if (!doc) return null;
                    const cell = doc.createElementNS('http://www.w3.org/1999/xhtml', 'span');
                    cell.className = 'cell zottablet-status';
                    cell.textContent = data || '';
                    return cell;
                }
            });
        } catch (e) {
            Zotero.logError(e);
        }
    };

    /**
     * Get item tablet status for display
     */
    this.getItemStatus = function(item) {
        if (!item || !item.isAttachment()) return '';

        const tagTablet = this.getPref('tagOnTablet');
        const tagModified = this.getPref('tagModified');
        const tagReading = this.getPref('tagReadingList');

        if (item.hasTag(tagModified)) return 'Modified';
        if (item.hasTag(tagTablet)) return 'On Tablet';
        if (item.hasTag(tagReading)) return 'Reading';

        return '';
    };

    /**
     * Notifier callback for item changes
     */
    this._notifierCallback = {
        notify: async function(event, type, ids, extraData) {
            // Handle item modifications if needed
            if (event === 'modify' && type === 'item') {
                // Could trigger automatic sync check here if enabled
            }
        }
    };

    // ==================== Preference Helpers ====================

    /**
     * Get preference value
     */
    this.getPref = function(key) {
        return Zotero.Prefs.get('extensions.zottablet.' + key, true);
    };

    /**
     * Set preference value
     */
    this.setPref = function(key, value) {
        return Zotero.Prefs.set('extensions.zottablet.' + key, value, true);
    };

    // ==================== Batch Processing ====================

    /**
     * Process items in parallel chunks with controlled concurrency
     * @param {Array} items - Items to process
     * @param {Function} processor - Async function(item) => { success: bool, data?: any, error?: Error, filename?: string }
     * @param {Object} options - { concurrency: 3, onProgress: fn(completed, total) }
     * @returns {Object} { successes: [], errors: [] }
     */
    this.processInBatches = async function(items, processor, options = {}) {
        const concurrency = options.concurrency || Zotero.ZotTablet.Constants.LIMITS.CONCURRENCY;
        const onProgress = options.onProgress || (() => {});

        const successes = [];
        const errors = [];
        let completed = 0;

        for (let i = 0; i < items.length; i += concurrency) {
            const chunk = items.slice(i, i + concurrency);
            const results = await Promise.all(chunk.map(async (item) => {
                try {
                    const result = await processor(item);
                    return { success: true, item, ...result };
                } catch (e) {
                    const filename = item.attachmentFilename || item.name || 'unknown';
                    return { success: false, error: e, item, filename };
                }
            }));

            for (const result of results) {
                completed++;
                if (result.success) {
                    successes.push(result);
                } else {
                    errors.push(result);
                }
                onProgress(completed, items.length);
            }
        }

        return { successes, errors };
    };

    // ==================== Utility Functions ====================

    /**
     * Get folder separator based on OS
     */
    this.getFolderSep = function() {
        return Zotero.isWin ? '\\' : '/';
    };

    /**
     * Get selected attachments from current Zotero selection
     */
    this.getSelectedAttachments = function() {
        const win = Zotero.getMainWindow();
        if (!win) return [];

        const items = win.ZoteroPane.getSelectedItems();
        const attachments = [];

        for (const item of items) {
            if (item.isRegularItem()) {
                // Get attachments of regular item
                const attIds = item.getAttachments();
                for (const attId of attIds) {
                    const att = Zotero.Items.get(attId);
                    if (att && att.isAttachment() && !att.isTopLevelItem()) {
                        attachments.push(att);
                    }
                }
            } else if (item.isAttachment() && !item.isTopLevelItem()) {
                attachments.push(item);
            }
        }

        // Filter to valid file attachments (not URLs)
        return attachments.filter(att =>
            att.attachmentLinkMode !== Zotero.Attachments.LINK_MODE_LINKED_URL
        );
    };

    /**
     * Check if file type should be processed
     */
    this.checkFileType = function(attachment) {
        const validTypes = ['application/pdf'];
        return validTypes.includes(attachment.attachmentContentType);
    };

    /**
     * Show info window/notification
     */
    this.showInfo = function(title, message, duration) {
        duration = duration || this.getPref('infoWindowDuration') || 4000;

        const progressWindow = new Zotero.ProgressWindow();
        progressWindow.changeHeadline(title);
        progressWindow.addDescription(message);
        progressWindow.show();
        progressWindow.startCloseTimer(duration);

        return progressWindow;
    };

    /**
     * Show progress window
     */
    this.showProgress = function(title) {
        const progressWindow = new Zotero.ProgressWindow();
        progressWindow.changeHeadline(title);
        progressWindow.show();
        return progressWindow;
    };

    /**
     * Create standard saved searches for ZotTablet
     * Shared between UI menu and preferences
     */
    this.createSavedSearches = async function() {
        const tags = this.SyncManager.getTags();
        const readingTag = this.ReadingList.getTag();

        const searchDefs = [
            {
                name: 'ZotTablet: On Tablet',
                conditions: [
                    ['tag', 'contains', tags.onTablet],
                    ['includeParentsAndChildren', 'true'],
                    ['noChildren', 'true']
                ]
            },
            {
                name: 'ZotTablet: Modified',
                conditions: [
                    ['tag', 'is', tags.modified]
                ]
            },
            {
                name: 'ZotTablet: Reading List',
                conditions: [
                    ['tag', 'is', readingTag],
                    ['includeParentsAndChildren', 'true'],
                    ['noChildren', 'true']
                ]
            }
        ];

        let created = 0;
        const existing = Zotero.Searches.getAll();

        for (const def of searchDefs) {
            // Skip if already exists
            if (existing.some(s => s.name === def.name)) {
                continue;
            }

            const search = new Zotero.Search();
            search.libraryID = Zotero.Libraries.userLibraryID;
            search.name = def.name;
            for (const [field, op, value] of def.conditions) {
                search.addCondition(field, op, value);
            }
            await search.saveTx();
            created++;
        }

        return created;
    };

    /**
     * Format string with placeholders
     */
    this.formatString = function(template, data) {
        return template.replace(/%\((\w+)\)/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    };

    // ==================== Error Handling ====================

    /**
     * Create standardised error result object
     * @param {Zotero.Item} item - The item that failed
     * @param {Error|string} error - The error
     * @param {string} code - Error code from Constants.ERROR_CODES
     * @param {boolean} recoverable - Whether operation can continue
     * @returns {Object} Standardised error object
     */
    this.createError = function(item, error, code, recoverable = true) {
        const C = Zotero.ZotTablet.Constants;
        return {
            item,
            filename: item?.attachmentFilename || item?.getField?.('title') || 'unknown',
            error: error instanceof Error ? error : new Error(String(error)),
            code: code || C.ERROR_CODES.UNKNOWN,
            recoverable
        };
    };

    /**
     * Format errors for display in progress window
     * @param {Array} errors - Array of error objects from createError
     * @param {number} maxDisplay - Maximum number of filenames to show
     * @returns {string} Formatted error summary
     */
    this.formatErrorSummary = function(errors, maxDisplay) {
        if (!errors || errors.length === 0) return '';

        const C = Zotero.ZotTablet.Constants;
        const limit = maxDisplay || C.LIMITS.ERROR_DISPLAY_LIMIT;
        const names = errors.map(e => e.filename).slice(0, limit);

        let msg = `(${errors.length} error(s): ${names.join(', ')}`;
        if (errors.length > limit) msg += '...';
        msg += ')';

        return msg;
    };

    /**
     * Get file extension
     */
    this.getFileExtension = function(filename) {
        const pos = filename.lastIndexOf('.');
        return pos === -1 ? '' : filename.substring(pos + 1).toLowerCase();
    };

    /**
     * Join path components - uses PathUtils when available (Zotero 8)
     */
    this.joinPath = function(...parts) {
        if (PathUtils && PathUtils.join) {
            return PathUtils.join(...parts.filter(p => p && p.length > 0));
        }
        // Fallback for Zotero 7
        const sep = this.getFolderSep();
        return parts
            .filter(p => p && p.length > 0)
            .join(sep)
            .replace(new RegExp(sep.replace(/\\/g, '\\\\') + '+', 'g'), sep);
    };

    /**
     * Get parent directory - uses PathUtils when available
     */
    this.getParentDir = function(path) {
        if (PathUtils && PathUtils.parent) {
            return PathUtils.parent(path);
        }
        return OS.Path.dirname(path);
    };

    /**
     * Get filename from path
     */
    this.getFilename = function(path) {
        if (PathUtils && PathUtils.filename) {
            return PathUtils.filename(path);
        }
        return OS.Path.basename(path);
    };

    /**
     * Check if file exists - uses IOUtils when available (Zotero 8)
     */
    this.fileExists = async function(path) {
        if (IOUtils && IOUtils.exists) {
            return await IOUtils.exists(path);
        }
        return await OS.File.exists(path);
    };

    /**
     * Create directory if it doesn't exist
     */
    this.ensureDirectory = async function(path) {
        if (IOUtils && IOUtils.makeDirectory) {
            await IOUtils.makeDirectory(path, { ignoreExisting: true, createAncestors: true });
        } else if (!(await OS.File.exists(path))) {
            await OS.File.makeDir(path, { ignoreExisting: true, from: OS.Constants.Path.homeDir });
        }
    };

    /**
     * Copy file with proper error handling
     * @param {boolean} overwrite - If true, overwrite existing file
     */
    this.copyFile = async function(sourcePath, destPath, overwrite = false) {
        // Ensure destination directory exists
        const destDir = this.getParentDir(destPath);
        await this.ensureDirectory(destDir);

        let finalPath = destPath;

        if (overwrite) {
            // Overwrite mode: remove existing file first
            if (await this.fileExists(destPath)) {
                await this.removeFile(destPath);
            }
        } else {
            // Handle existing file by creating new name
            let counter = 2;
            while (await this.fileExists(finalPath)) {
                const ext = this.getFileExtension(destPath);
                const base = destPath.substring(0, destPath.length - ext.length - 1);
                finalPath = `${base}_${counter}.${ext}`;
                counter++;
                if (counter > Zotero.ZotTablet.Constants.LIMITS.MAX_RENAME_COUNTER) {
                    throw new Error('Too many files with same name');
                }
            }
        }

        if (IOUtils && IOUtils.copy) {
            await IOUtils.copy(sourcePath, finalPath);
        } else {
            await OS.File.copy(sourcePath, finalPath);
        }
        return finalPath;
    };

    /**
     * Move file with proper error handling
     */
    this.moveFile = async function(sourcePath, destPath) {
        // Ensure destination directory exists
        const destDir = this.getParentDir(destPath);
        await this.ensureDirectory(destDir);

        // Handle existing file
        let finalPath = destPath;
        let counter = 2;
        while (await this.fileExists(finalPath)) {
            const ext = this.getFileExtension(destPath);
            const base = destPath.substring(0, destPath.length - ext.length - 1);
            finalPath = `${base}_${counter}.${ext}`;
            counter++;
            if (counter > Zotero.ZotTablet.Constants.LIMITS.MAX_RENAME_COUNTER) {
                throw new Error('Too many files with same name');
            }
        }

        if (IOUtils && IOUtils.move) {
            await IOUtils.move(sourcePath, finalPath);
        } else {
            await OS.File.move(sourcePath, finalPath);
        }
        return finalPath;
    };

    /**
     * Read file contents
     */
    this.readFile = async function(path) {
        if (IOUtils && IOUtils.read) {
            return await IOUtils.read(path);
        }
        return await OS.File.read(path);
    };

    /**
     * Get file modification time
     */
    this.getFileModTime = async function(path) {
        try {
            if (IOUtils && IOUtils.stat) {
                const stat = await IOUtils.stat(path);
                return stat.lastModified;
            }
            const stat = await OS.File.stat(path);
            return Date.parse(stat.lastModificationDate);
        } catch (e) {
            return 0;
        }
    };

    /**
     * Remove file
     */
    this.removeFile = async function(path) {
        try {
            if (IOUtils && IOUtils.remove) {
                await IOUtils.remove(path, { ignoreAbsent: true });
            } else {
                await OS.File.remove(path, { ignoreAbsent: true });
            }
        } catch (e) {
            Zotero.debug(`ZotTablet: Failed to remove file: ${path}`);
        }
    };

    /**
     * Remove empty directories recursively up to a base path
     */
    this.removeEmptyDirs = async function(dirPath, basePath) {
        if (!dirPath || dirPath === basePath) return;

        try {
            const dirFile = Zotero.File.pathToFile(dirPath);
            if (!dirFile.exists() || !dirFile.isDirectory()) return;

            // Check if directory is empty (no non-hidden files)
            const entries = dirFile.directoryEntries;
            let hasFiles = false;
            while (entries.hasMoreElements()) {
                const entry = entries.getNext().QueryInterface(Ci.nsIFile);
                if (!entry.isHidden()) {
                    hasFiles = true;
                    break;
                }
            }

            if (!hasFiles) {
                dirFile.remove(true);
                // Try parent
                const parentPath = this.getParentDir(dirPath);
                if (parentPath !== basePath) {
                    await this.removeEmptyDirs(parentPath, basePath);
                }
            }
        } catch (e) {
            // Ignore errors when removing directories
        }
    };
};
