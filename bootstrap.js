/**
 * ZotTablet - Bootstrap Entry Point
 * Plugin for Zotero 7/8 to manage PDFs for external reading
 *
 * Compatible with Zotero 7 (Firefox 115) and Zotero 8 (Firefox 140)
 */

var ZotTablet;
var chromeHandle;

// Preference defaults loaded from constants module after init
var PREF_DEFAULTS = null;

/**
 * Called when the plugin is first installed
 */
function install(data, reason) {
    // Nothing to do on install
}

/**
 * Called when the plugin is being removed
 */
function uninstall(data, reason) {
    // Nothing to do on uninstall
}

/**
 * Called when the plugin is enabled/started
 */
async function startup({ id, version, resourceURI, rootURI = resourceURI.spec }) {
    // Register chrome resources
    const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
        .getService(Ci.amIAddonManagerStartup);

    const manifestURI = Services.io.newURI(rootURI + "manifest.json");

    chromeHandle = aomStartup.registerChrome(manifestURI, [
        ["content", "zottablet", rootURI + "content/"],
        ["locale", "zottablet", "en-US", rootURI + "locale/en-US/"],
        ["locale", "zottablet", "es-ES", rootURI + "locale/es-ES/"]
    ]);

    // Wait for Zotero to be ready
    await Zotero.Schema.schemaUpdatePromise;

    // Load main plugin script
    Services.scriptloader.loadSubScript(rootURI + "content/zottablet.js");

    // Load constants module
    Services.scriptloader.loadSubScript(rootURI + "content/constants.js");

    // Set default preferences (must be after constants module is loaded)
    setDefaultPrefs();

    // Initialize main module
    ZotTablet = Zotero.ZotTablet;
    await ZotTablet.init({ id, version, rootURI });

    // Register preference pane
    Zotero.PreferencePanes.register({
        pluginID: 'zottablet@zotero.org',
        src: rootURI + 'content/prefs.xhtml',
        scripts: [rootURI + 'content/prefs.js'],
        stylesheets: [rootURI + 'skin/default/prefs.css'],
        label: 'ZotTablet'
    });

    // Initialize UI for already-open windows
    // This is needed because onMainWindowLoad is only called for windows
    // that open AFTER the plugin loads
    for (const win of Zotero.getMainWindows()) {
        onMainWindowLoad({ window: win });
    }

    Zotero.debug('ZotTablet: Startup complete');
}

/**
 * Called when the plugin is disabled/stopped
 */
function shutdown({ id, version, resourceURI, rootURI = resourceURI.spec }, reason) {
    // Don't bother cleaning up if Zotero is shutting down
    if (reason === APP_SHUTDOWN) {
        return;
    }

    // Cleanup ZotTablet
    if (ZotTablet) {
        ZotTablet.shutdown();
        ZotTablet = null;
    }

    // Unregister chrome resources
    if (chromeHandle) {
        chromeHandle.destruct();
        chromeHandle = null;
    }

    // Remove from Zotero namespace
    delete Zotero.ZotTablet;
}

/**
 * Called when main Zotero window loads
 */
function onMainWindowLoad({ window }) {
    if (ZotTablet) {
        ZotTablet.onMainWindowLoad(window);
    }
}

/**
 * Called when main Zotero window unloads
 */
function onMainWindowUnload({ window }) {
    if (ZotTablet) {
        ZotTablet.onMainWindowUnload(window);
    }
}

/**
 * Set default preferences if not already set
 */
function setDefaultPrefs() {
    const C = Zotero.ZotTablet.Constants;
    for (const [key, value] of Object.entries(C.PREF_DEFAULTS)) {
        const fullKey = C.PREF_NAMESPACE + key;
        if (Zotero.Prefs.get(fullKey, true) === undefined) {
            Zotero.Prefs.set(fullKey, value, true);
        }
    }
}
