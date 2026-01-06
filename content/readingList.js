/**
 * ZotTablet - Reading List Module
 * Manages the reading list functionality using Zotero tags
 */

Zotero.ZotTablet.ReadingListModule = new function() {
    const ZT = Zotero.ZotTablet;

    /**
     * Initialize the reading list module
     */
    this.init = async function() {
        Zotero.debug('ZotTablet ReadingList: Initialized');
    };

    /**
     * Shutdown the reading list module
     */
    this.shutdown = function() {
        Zotero.debug('ZotTablet ReadingList: Shutdown');
    };

    /**
     * Get the reading list tag
     */
    this.getTag = function() {
        return ZT.getPref('tagReadingList') || '_reading_list';
    };

    /**
     * Add items to reading list
     * @param {Zotero.Item[]} items - Items to add
     */
    this.addToReadingList = async function(items) {
        const tag = this.getTag();
        const progressWin = ZT.showProgress('Adding to Reading List');

        const toSave = [];

        for (const item of items) {
            try {
                const targetItem = item.isAttachment() && !item.isTopLevelItem()
                    ? Zotero.Items.get(item.parentItemID)
                    : item;

                if (targetItem && !targetItem.hasTag(tag)) {
                    targetItem.addTag(tag);
                    toSave.push(targetItem);

                    const progress = new progressWin.ItemProgress(
                        'chrome://zotero/skin/treeitem.png',
                        targetItem.getField('title').substring(0, 50)
                    );
                    progress.setProgress(100);
                }
            } catch (e) {
                Zotero.logError(e);
            }
        }

        // Batch save in single transaction
        if (toSave.length > 0) {
            await Zotero.DB.executeTransaction(async () => {
                for (const item of toSave) {
                    await item.save();
                }
            });
        }

        progressWin.addDescription(`Added ${toSave.length} item(s) to reading list`);
        progressWin.startCloseTimer(ZT.getPref('infoWindowDuration'));
    };

    /**
     * Remove items from reading list
     * @param {Zotero.Item[]} items - Items to remove
     */
    this.removeFromReadingList = async function(items) {
        const tag = this.getTag();
        const progressWin = ZT.showProgress('Removing from Reading List');

        const toSave = [];

        for (const item of items) {
            try {
                // Get the parent item if this is an attachment
                const targetItem = item.isAttachment() && !item.isTopLevelItem()
                    ? Zotero.Items.get(item.parentItemID)
                    : item;

                if (targetItem && targetItem.hasTag(tag)) {
                    targetItem.removeTag(tag);
                    toSave.push(targetItem);

                    const progress = new progressWin.ItemProgress(
                        'chrome://zotero/skin/treeitem.png',
                        targetItem.getField('title').substring(0, 50)
                    );
                    progress.setProgress(100);
                }
            } catch (e) {
                Zotero.logError(e);
            }
        }

        // Batch save in single transaction
        if (toSave.length > 0) {
            await Zotero.DB.executeTransaction(async () => {
                for (const item of toSave) {
                    await item.save();
                }
            });
        }

        progressWin.addDescription(`Removed ${toSave.length} item(s) from reading list`);
        progressWin.startCloseTimer(ZT.getPref('infoWindowDuration'));
    };

    /**
     * Get all items in reading list
     * @returns {Promise<Zotero.Item[]>}
     */
    this.getReadingListItems = async function() {
        const tag = this.getTag();

        const search = new Zotero.Search();
        search.addCondition('tag', 'is', tag);

        const ids = await search.search();
        return Zotero.Items.get(ids);
    };

    /**
     * Check if an item is in the reading list
     * @param {Zotero.Item} item
     * @returns {boolean}
     */
    this.isInReadingList = function(item) {
        const tag = this.getTag();

        // Check parent if attachment
        if (item.isAttachment() && !item.isTopLevelItem()) {
            const parent = Zotero.Items.get(item.parentItemID);
            return parent && parent.hasTag(tag);
        }

        return item.hasTag(tag);
    };

    /**
     * Toggle item in reading list
     * @param {Zotero.Item} item
     */
    this.toggleReadingList = async function(item) {
        if (this.isInReadingList(item)) {
            await this.removeFromReadingList([item]);
        } else {
            await this.addToReadingList([item]);
        }
    };

    /**
     * Get reading list count
     * @returns {Promise<number>}
     */
    this.getCount = async function() {
        const items = await this.getReadingListItems();
        return items.length;
    };
};
