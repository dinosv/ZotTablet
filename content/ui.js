/**
 * ZotTablet - UI Module
 * Handles menu items and user interface elements
 *
 * Compatible with Zotero 7 (Firefox 115) and Zotero 8 (Firefox 140)
 * Uses manual DOM manipulation to add menu items
 */

Zotero.ZotTablet.UIModule = new function() {
    const ZT = Zotero.ZotTablet;

    // Track menu items for cleanup
    this._menuItems = [];
    this._windows = new WeakMap();

    /**
     * Initialize the UI module
     */
    this.init = async function() {
        Zotero.debug('ZotTablet UI: Initialized');
    };

    /**
     * Shutdown the UI module
     */
    this.shutdown = function() {
        // Menu items will be cleaned up in onMainWindowUnload
        Zotero.debug('ZotTablet UI: Shutdown');
    };

    /**
     * Called when main Zotero window loads
     */
    this.onMainWindowLoad = function(window) {
        const doc = window.document;

        // Store window-specific data
        const windowData = {
            menuItems: []
        };
        this._windows.set(window, windowData);

        // Add context menu items
        this._addContextMenuItems(doc, windowData);

        // Add tools menu items
        this._addToolsMenuItems(doc, windowData);

        Zotero.debug('ZotTablet UI: Menus added to window');
    };

    /**
     * Called when main Zotero window unloads
     */
    this.onMainWindowUnload = function(window) {
        const windowData = this._windows.get(window);
        if (windowData) {
            // Remove all menu items
            for (const item of windowData.menuItems) {
                try {
                    if (item && item.parentNode) {
                        item.parentNode.removeChild(item);
                    }
                } catch (e) {
                    // Ignore errors during cleanup
                }
            }
            this._windows.delete(window);
        }
    };

    // ==================== Public Methods for Bootstrap.js ====================

    /**
     * Add selected items to reading list (called from bootstrap.js MenuManager)
     */
    this.onAddToReadingList = async function() {
        await this._onAddToReadingList();
    };

    /**
     * Remove selected items from reading list (called from bootstrap.js MenuManager)
     */
    this.onRemoveFromReadingList = async function() {
        await this._onRemoveFromReadingList();
    };

    /**
     * Send to tablet (called from bootstrap.js MenuManager)
     */
    this.onSendToTablet = async function(projectFolder = '') {
        await this._onSendToTablet(projectFolder);
    };

    /**
     * Get from tablet (called from bootstrap.js MenuManager)
     */
    this.onGetFromTablet = async function() {
        await this._onGetFromTablet();
    };

    /**
     * Check modifications (called from bootstrap.js MenuManager)
     */
    this.onCheckModifications = async function() {
        await this._onCheckModifications();
    };

    /**
     * Extract annotations (called from bootstrap.js MenuManager)
     */
    this.onExtractAnnotations = async function() {
        await this._onExtractAnnotations();
    };

    // ==================== Context Menu ====================

    /**
     * Add items to the item context menu
     */
    this._addContextMenuItems = function(doc, windowData) {
        // Find the item context menu
        const itemMenu = doc.getElementById('zotero-itemmenu');
        if (!itemMenu) return;

        // Create separator
        const separator = doc.createXULElement('menuseparator');
        separator.id = 'zottablet-separator';
        itemMenu.appendChild(separator);
        windowData.menuItems.push(separator);

        // Create ZotTablet submenu
        const menu = doc.createXULElement('menu');
        menu.id = 'zottablet-menu';
        menu.setAttribute('label', 'ZotTablet');
        itemMenu.appendChild(menu);
        windowData.menuItems.push(menu);

        const menuPopup = doc.createXULElement('menupopup');
        menuPopup.id = 'zottablet-menupopup';
        menu.appendChild(menuPopup);

        // --- Reading List Items ---

        // Add to Reading List
        const addReadingItem = doc.createXULElement('menuitem');
        addReadingItem.id = 'zottablet-add-reading';
        addReadingItem.setAttribute('label', 'Add to Reading List');
        addReadingItem.addEventListener('command', () => this._onAddToReadingList());
        menuPopup.appendChild(addReadingItem);

        // Remove from Reading List
        const removeReadingItem = doc.createXULElement('menuitem');
        removeReadingItem.id = 'zottablet-remove-reading';
        removeReadingItem.setAttribute('label', 'Remove from Reading List');
        removeReadingItem.addEventListener('command', () => this._onRemoveFromReadingList());
        menuPopup.appendChild(removeReadingItem);

        menuPopup.appendChild(doc.createXULElement('menuseparator'));

        // --- Tablet Items ---

        // Send to Tablet
        const sendItem = doc.createXULElement('menuitem');
        sendItem.id = 'zottablet-send';
        sendItem.setAttribute('label', 'Send to Tablet');
        sendItem.addEventListener('command', () => this._onSendToTablet());
        menuPopup.appendChild(sendItem);

        // Send to Tablet (Project Submenu)
        const sendProjectMenu = doc.createXULElement('menu');
        sendProjectMenu.id = 'zottablet-send-project';
        sendProjectMenu.setAttribute('label', 'Send to Project Folder');
        menuPopup.appendChild(sendProjectMenu);

        const sendProjectPopup = doc.createXULElement('menupopup');
        sendProjectPopup.id = 'zottablet-send-project-popup';
        sendProjectMenu.appendChild(sendProjectPopup);

        // Populate project folders on popup show
        sendProjectPopup.addEventListener('popupshowing', () => {
            this._populateProjectFolders(sendProjectPopup, doc);
        });

        // Get from Tablet
        const getItem = doc.createXULElement('menuitem');
        getItem.id = 'zottablet-get';
        getItem.setAttribute('label', 'Get from Tablet');
        getItem.addEventListener('command', () => this._onGetFromTablet());
        menuPopup.appendChild(getItem);

        // Check Modifications
        const checkItem = doc.createXULElement('menuitem');
        checkItem.id = 'zottablet-check';
        checkItem.setAttribute('label', 'Check Modifications');
        checkItem.addEventListener('command', () => this._onCheckModifications());
        menuPopup.appendChild(checkItem);

        menuPopup.appendChild(doc.createXULElement('menuseparator'));

        // --- Annotation Items ---

        // Extract Annotations (import into Zotero)
        const extractItem = doc.createXULElement('menuitem');
        extractItem.id = 'zottablet-extract';
        extractItem.setAttribute('label', 'Extract Annotations');
        extractItem.addEventListener('command', () => this._onExtractAnnotations());
        menuPopup.appendChild(extractItem);

        // Extract Annotations to Note
        const extractNoteItem = doc.createXULElement('menuitem');
        extractNoteItem.id = 'zottablet-extract-note';
        extractNoteItem.setAttribute('label', 'Extract Annotations to Note');
        extractNoteItem.addEventListener('command', () => this._onExtractAnnotationsToNote());
        menuPopup.appendChild(extractNoteItem);

        // Update menu state when shown
        menuPopup.addEventListener('popupshowing', () => {
            this._updateMenuState(doc);
        });
    };

    /**
     * Add items to the Tools menu
     */
    this._addToolsMenuItems = function(doc, windowData) {
        const toolsMenu = doc.getElementById('menu_ToolsPopup');
        if (!toolsMenu) return;

        // Create separator
        const separator = doc.createXULElement('menuseparator');
        separator.id = 'zottablet-tools-separator';
        toolsMenu.appendChild(separator);
        windowData.menuItems.push(separator);

        // Create ZotTablet submenu
        const menu = doc.createXULElement('menu');
        menu.id = 'zottablet-tools-menu';
        menu.setAttribute('label', 'ZotTablet');
        toolsMenu.appendChild(menu);
        windowData.menuItems.push(menu);

        const menuPopup = doc.createXULElement('menupopup');
        menu.appendChild(menuPopup);

        // Sync All Modified
        const syncAllItem = doc.createXULElement('menuitem');
        syncAllItem.setAttribute('label', 'Sync All Modified Files');
        syncAllItem.addEventListener('command', () => this._onSyncAllModified());
        menuPopup.appendChild(syncAllItem);

        // Check All Modifications
        const checkAllItem = doc.createXULElement('menuitem');
        checkAllItem.setAttribute('label', 'Check All Tablet Files');
        checkAllItem.addEventListener('command', () => this._onCheckAllModifications());
        menuPopup.appendChild(checkAllItem);

        menuPopup.appendChild(doc.createXULElement('menuseparator'));

        // Open Tablet Folder
        const openFolderItem = doc.createXULElement('menuitem');
        openFolderItem.setAttribute('label', 'Open Tablet Folder');
        openFolderItem.addEventListener('command', () => this._onOpenTabletFolder());
        menuPopup.appendChild(openFolderItem);

        // Create Saved Searches
        const createSearchesItem = doc.createXULElement('menuitem');
        createSearchesItem.setAttribute('label', 'Create Saved Searches');
        createSearchesItem.addEventListener('command', () => this._onCreateSavedSearches());
        menuPopup.appendChild(createSearchesItem);

        menuPopup.appendChild(doc.createXULElement('menuseparator'));

        // Preferences
        const prefsItem = doc.createXULElement('menuitem');
        prefsItem.setAttribute('label', 'ZotTablet Preferences...');
        prefsItem.addEventListener('command', () => this._onOpenPreferences());
        menuPopup.appendChild(prefsItem);
    };

    /**
     * Populate project folders submenu
     */
    this._populateProjectFolders = function(popup, doc) {
        // Clear existing items
        while (popup.firstChild) {
            popup.removeChild(popup.firstChild);
        }

        // Get project folders from preferences
        let folders = [];
        try {
            const raw = ZT.getPref('projectFolders');
            if (raw && typeof raw === 'string') {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    folders = parsed;
                } else {
                    Zotero.debug('ZotTablet: projectFolders is not an array, resetting');
                    ZT.setPref('projectFolders', '[]');
                }
            }
        } catch (e) {
            Zotero.debug('ZotTablet: Invalid projectFolders JSON, resetting');
            ZT.setPref('projectFolders', '[]');
        }

        if (folders.length === 0) {
            const emptyItem = doc.createXULElement('menuitem');
            emptyItem.setAttribute('label', '(No project folders configured)');
            emptyItem.setAttribute('disabled', 'true');
            popup.appendChild(emptyItem);
            return;
        }

        for (const folder of folders) {
            const item = doc.createXULElement('menuitem');
            item.setAttribute('label', folder.label || folder.path);
            item.addEventListener('command', () => {
                this._onSendToTablet(folder.path);
            });
            popup.appendChild(item);
        }
    };

    /**
     * Update menu item states based on selection
     */
    this._updateMenuState = function(doc) {
        const attachments = ZT.getSelectedAttachments();

        // Check if any are on tablet
        const anyOnTablet = attachments.some(att => ZT.SyncManager.isOnTablet(att));
        const anyNotOnTablet = attachments.some(att => !ZT.SyncManager.isOnTablet(att));

        // Check reading list status
        const anyInReading = attachments.some(att => ZT.ReadingList.isInReadingList(att));
        const anyNotInReading = attachments.some(att => !ZT.ReadingList.isInReadingList(att));

        // Update menu items
        const getItem = doc.getElementById('zottablet-get');
        const checkItem = doc.getElementById('zottablet-check');
        const addReadingItem = doc.getElementById('zottablet-add-reading');
        const removeReadingItem = doc.getElementById('zottablet-remove-reading');

        if (getItem) {
            getItem.disabled = !anyOnTablet;
        }
        if (checkItem) {
            checkItem.disabled = !anyOnTablet;
        }
        if (addReadingItem) {
            addReadingItem.disabled = !anyNotInReading;
        }
        if (removeReadingItem) {
            removeReadingItem.disabled = !anyInReading;
        }
    };

    // ==================== Menu Actions ====================

    /**
     * Add selected items to reading list
     */
    this._onAddToReadingList = async function() {
        const win = Zotero.getMainWindow();
        const items = win.ZoteroPane.getSelectedItems();
        await ZT.ReadingList.addToReadingList(items);
    };

    /**
     * Remove selected items from reading list
     */
    this._onRemoveFromReadingList = async function() {
        const win = Zotero.getMainWindow();
        const items = win.ZoteroPane.getSelectedItems();
        await ZT.ReadingList.removeFromReadingList(items);
    };

    /**
     * Send selected attachments to tablet
     */
    this._onSendToTablet = async function(projectFolder = '') {
        const attachments = ZT.getSelectedAttachments();
        const { valid, invalid } = ZT.SyncManager.validateForSend(attachments);

        if (valid.length === 0) {
            const reason = invalid.length > 0 ? invalid[0].reason : 'No attachments selected';
            ZT.showInfo('ZotTablet', reason);
            return;
        }

        if (ZT.SyncManager.needsBatchConfirmation(valid.length)) {
            if (!Services.prompt.confirm(null, 'ZotTablet', `Send ${valid.length} file(s) to tablet?`)) {
                return;
            }
        }

        await ZT.SyncManager.sendToTablet(valid, projectFolder);
    };

    /**
     * Get selected attachments from tablet
     */
    this._onGetFromTablet = async function() {
        const attachments = ZT.getSelectedAttachments();
        const { valid, invalid } = ZT.SyncManager.validateForGet(attachments);

        if (valid.length === 0) {
            const reason = invalid.length > 0 ? invalid[0].reason : 'No attachments selected';
            ZT.showInfo('ZotTablet', reason);
            return;
        }

        if (ZT.SyncManager.needsBatchConfirmation(valid.length)) {
            if (!Services.prompt.confirm(null, 'ZotTablet', `Get ${valid.length} file(s) from tablet?`)) {
                return;
            }
        }

        await ZT.SyncManager.getFromTablet(valid);
    };

    /**
     * Check modifications for selected attachments
     */
    this._onCheckModifications = async function() {
        const attachments = ZT.getSelectedAttachments()
            .filter(att => ZT.SyncManager.isOnTablet(att));

        if (attachments.length === 0) {
            ZT.showInfo('ZotTablet', 'No tablet attachments selected');
            return;
        }

        await ZT.SyncManager.checkModifications(attachments);
    };

    /**
     * Extract annotations from selected attachments
     */
    this._onExtractAnnotations = async function() {
        const attachments = ZT.getSelectedAttachments()
            .filter(att => att.attachmentContentType === 'application/pdf');

        if (attachments.length === 0) {
            ZT.showInfo('ZotTablet', 'No PDF attachments selected');
            return;
        }

        await ZT.AnnotationExtractor.extractAnnotations(attachments);
    };

    /**
     * Extract annotations from selected attachments and create a note
     */
    this._onExtractAnnotationsToNote = async function() {
        const attachments = ZT.getSelectedAttachments()
            .filter(att => att.attachmentContentType === 'application/pdf');

        if (attachments.length === 0) {
            ZT.showInfo('ZotTablet', 'No PDF attachments selected');
            return;
        }

        await ZT.AnnotationExtractor.extractAnnotationsToNote(attachments);
    };

    /**
     * Sync all modified files from tablet
     */
    this._onSyncAllModified = async function() {
        const attachments = await ZT.SyncManager.getAttachmentsOnTablet();
        const modified = [];

        for (const att of attachments) {
            if (await ZT.SyncManager.isModified(att)) {
                modified.push(att);
            }
        }

        if (modified.length === 0) {
            ZT.showInfo('ZotTablet', 'No modified files found');
            return;
        }

        const confirmed = Services.prompt.confirm(
            null,
            'ZotTablet',
            `Found ${modified.length} modified file(s). Sync now?`
        );

        if (confirmed) {
            await ZT.SyncManager.getFromTablet(modified);
        }
    };

    /**
     * Check all tablet files for modifications
     */
    this._onCheckAllModifications = async function() {
        const attachments = await ZT.SyncManager.getAttachmentsOnTablet();

        if (attachments.length === 0) {
            ZT.showInfo('ZotTablet', 'No files on tablet');
            return;
        }

        await ZT.SyncManager.checkModifications(attachments);
    };

    /**
     * Open tablet folder in file manager
     */
    this._onOpenTabletFolder = function() {
        const destDir = ZT.getPref('destDir');
        if (!destDir) {
            ZT.showInfo('ZotTablet', 'Please set the tablet folder in preferences');
            return;
        }

        try {
            const file = Zotero.File.pathToFile(destDir);
            if (file.exists()) {
                file.reveal();
            } else {
                ZT.showInfo('ZotTablet', 'Tablet folder does not exist');
            }
        } catch (e) {
            Zotero.logError(e);
        }
    };

    /**
     * Create saved searches
     */
    this._onCreateSavedSearches = async function() {
        const created = await ZT.createSavedSearches();
        if (created > 0) {
            ZT.showInfo('ZotTablet', `Created ${created} saved search(es)`);
        } else {
            ZT.showInfo('ZotTablet', 'Saved searches already exist');
        }
    };

    /**
     * Open preferences
     */
    this._onOpenPreferences = function() {
        Zotero.openPreferences('zottablet');
    };
};
