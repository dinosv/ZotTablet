/**
 * ZotTablet Preferences Panel Script
 * Compatible with Zotero 8
 */

var FilePicker;
try {
    FilePicker = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs").FilePicker;
} catch (e) {
    Zotero.debug('ZotTablet Prefs: FilePicker import failed: ' + e.message);
}

// Initialize when DOM is ready - use MutationObserver to wait for elements
function waitForElement(id, callback, maxAttempts = 50) {
    let attempts = 0;
    const check = () => {
        const el = document.getElementById(id);
        if (el) {
            callback();
        } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(check, 100);
        } else {
            Zotero.debug('ZotTablet Prefs: Gave up waiting for ' + id);
        }
    };
    check();
}

// Wait for the browse button to exist, then init
setTimeout(() => {
    waitForElement('zottablet-dest-dir-browse', init);
}, 100);

function init() {
    Zotero.debug('ZotTablet Prefs: Initializing');

    // Browse button
    const browseBtn = document.getElementById('zottablet-dest-dir-browse');
    Zotero.debug('ZotTablet Prefs: browseBtn = ' + browseBtn);
    if (browseBtn) {
        browseBtn.addEventListener('command', browseDestDir);
        browseBtn.addEventListener('click', browseDestDir);
        Zotero.debug('ZotTablet Prefs: Browse button listener added');
    } else {
        Zotero.debug('ZotTablet Prefs: Browse button NOT FOUND');
    }

    // Add project folder button
    const addProjectBtn = document.getElementById('zottablet-add-project');
    if (addProjectBtn) {
        addProjectBtn.addEventListener('command', addProjectFolder);
        addProjectBtn.addEventListener('click', addProjectFolder);
    }

    // Create saved searches button
    const createSearchesBtn = document.getElementById('zottablet-create-searches');
    if (createSearchesBtn) {
        createSearchesBtn.addEventListener('command', createSavedSearches);
        createSearchesBtn.addEventListener('click', createSavedSearches);
    }

    // Load current values
    loadCurrentValues();
    loadProjectFolders();

    Zotero.debug('ZotTablet Prefs: Initialized');
}

function loadCurrentValues() {
    // Text inputs
    const textFields = {
        'zottablet-dest-dir': 'extensions.zottablet.destDir',
        'zottablet-subfolder-format': 'extensions.zottablet.subfolderFormat',
        'zottablet-tag-tablet': 'extensions.zottablet.tagOnTablet',
        'zottablet-tag-modified': 'extensions.zottablet.tagModified',
        'zottablet-tag-reading': 'extensions.zottablet.tagReadingList'
    };

    // Use centralised defaults from Constants
    const C = Zotero.ZotTablet.Constants;
    const defaults = {
        'zottablet-tag-tablet': C.PREF_DEFAULTS.tagOnTablet,
        'zottablet-tag-modified': C.PREF_DEFAULTS.tagModified,
        'zottablet-tag-reading': C.PREF_DEFAULTS.tagReadingList,
        'zottablet-subfolder-format': C.PREF_DEFAULTS.subfolderFormat
    };

    for (const [id, pref] of Object.entries(textFields)) {
        const el = document.getElementById(id);
        if (el) {
            const val = Zotero.Prefs.get(pref, true);
            el.value = val !== undefined ? val : (defaults[id] || '');
            el.addEventListener('input', function() {
                Zotero.Prefs.set(pref, this.value, true);
            });
            el.addEventListener('change', function() {
                Zotero.Prefs.set(pref, this.value, true);
            });
        }
    }

    // Checkboxes
    const checkboxFields = {
        'zottablet-rename': 'extensions.zottablet.rename',
        'zottablet-subfolder': 'extensions.zottablet.subfolder',
        'zottablet-extract-on-sync': 'extensions.zottablet.extractOnSync'
    };

    const checkDefaults = {
        'zottablet-rename': C.PREF_DEFAULTS.rename,
        'zottablet-extract-on-sync': C.PREF_DEFAULTS.extractOnSync
    };

    for (const [id, pref] of Object.entries(checkboxFields)) {
        const el = document.getElementById(id);
        if (el) {
            const val = Zotero.Prefs.get(pref, true);
            el.checked = val !== undefined ? val : (checkDefaults[id] || false);
            el.addEventListener('command', function() {
                Zotero.Prefs.set(pref, this.checked, true);
            });
        }
    }

    // Menulist (sync mode)
    const modeEl = document.getElementById('zottablet-mode');
    if (modeEl) {
        const val = Zotero.Prefs.get('extensions.zottablet.mode', true);
        modeEl.value = val !== undefined ? val : 1;
        modeEl.addEventListener('command', function() {
            Zotero.Prefs.set('extensions.zottablet.mode', parseInt(this.value), true);
        });
    }
}

async function browseDestDir() {
    try {
        Zotero.debug('ZotTablet Prefs: Browse button clicked');

        if (!FilePicker) {
            // Fallback: use nsIFilePicker directly
            const nsIFilePicker = Ci.nsIFilePicker;
            const fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
            fp.init(window, 'Select Tablet/External Folder', nsIFilePicker.modeGetFolder);

            fp.open((result) => {
                if (result === nsIFilePicker.returnOK) {
                    const path = fp.file.path;
                    const input = document.getElementById('zottablet-dest-dir');
                    if (input) {
                        input.value = path;
                        Zotero.Prefs.set('extensions.zottablet.destDir', path, true);
                    }
                }
            });
            return;
        }

        const fp = new FilePicker();
        fp.init(window, 'Select Tablet/External Folder', fp.modeGetFolder);

        const result = await fp.show();
        if (result === fp.returnOK) {
            const input = document.getElementById('zottablet-dest-dir');
            if (input) {
                input.value = fp.file;
                Zotero.Prefs.set('extensions.zottablet.destDir', fp.file, true);
            }
        }
    } catch (e) {
        Zotero.debug('ZotTablet Prefs: Browse error: ' + e.message);
        Zotero.logError(e);
        Services.prompt.alert(window, 'ZotTablet', 'Error selecting folder: ' + e.message);
    }
}

function loadProjectFolders() {
    const container = document.getElementById('zottablet-project-folders');
    if (!container) return;

    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }

    try {
        const folders = JSON.parse(
            Zotero.Prefs.get('extensions.zottablet.projectFolders', true) || '[]'
        );
        folders.forEach((folder, index) => addProjectFolderRow(container, folder, index));
    } catch (e) {
        Zotero.logError(e);
    }
}

function addProjectFolderRow(container, folder = { label: '', path: '' }, index) {
    const hbox = document.createXULElement('hbox');
    hbox.setAttribute('align', 'center');
    hbox.style.marginBottom = '4px';

    const labelInput = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
    labelInput.type = 'text';
    labelInput.value = folder.label || '';
    labelInput.placeholder = 'Project Name';
    labelInput.style.width = '150px';
    labelInput.style.marginRight = '8px';
    labelInput.addEventListener('input', saveProjectFolders);

    const pathInput = document.createElementNS('http://www.w3.org/1999/xhtml', 'input');
    pathInput.type = 'text';
    pathInput.value = folder.path || '';
    pathInput.placeholder = 'Subfolder path';
    pathInput.style.flex = '1';
    pathInput.style.marginRight = '8px';
    pathInput.addEventListener('input', saveProjectFolders);

    const removeBtn = document.createXULElement('button');
    removeBtn.setAttribute('label', 'X');
    removeBtn.addEventListener('command', () => {
        hbox.remove();
        saveProjectFolders();
    });

    hbox.appendChild(labelInput);
    hbox.appendChild(pathInput);
    hbox.appendChild(removeBtn);
    container.appendChild(hbox);
}

function addProjectFolder() {
    const container = document.getElementById('zottablet-project-folders');
    if (container) {
        addProjectFolderRow(container, { label: '', path: '' }, container.children.length);
    }
}

function saveProjectFolders() {
    const container = document.getElementById('zottablet-project-folders');
    if (!container) return;

    const folders = [];
    for (const row of container.children) {
        const inputs = row.querySelectorAll('input');
        if (inputs.length >= 2) {
            const label = inputs[0].value.trim();
            const path = inputs[1].value.trim();
            if (label || path) {
                folders.push({ label, path });
            }
        }
    }
    Zotero.Prefs.set('extensions.zottablet.projectFolders', JSON.stringify(folders), true);
}

async function createSavedSearches() {
    try {
        const created = await Zotero.ZotTablet.createSavedSearches();
        if (created > 0) {
            Services.prompt.alert(window, 'ZotTablet', `Created ${created} saved search(es)`);
        } else {
            Services.prompt.alert(window, 'ZotTablet', 'Saved searches already exist');
        }
    } catch (e) {
        Zotero.logError(e);
        Services.prompt.alert(window, 'ZotTablet', 'Error: ' + e.message);
    }
}
