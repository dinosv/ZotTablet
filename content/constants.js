/**
 * ZotTablet - Constants and Configuration
 * Centralised configuration to eliminate duplication
 */

(function() {
    if (typeof Zotero === 'undefined' || !Zotero.ZotTablet) {
        // Will be initialised by zottablet.js
        return;
    }

    Zotero.ZotTablet.Constants = {
        // Preference namespace
        PREF_NAMESPACE: 'extensions.zottablet.',

        // Preference keys (without namespace prefix)
        PREF_KEYS: {
            DEST_DIR: 'destDir',
            MODE: 'mode',
            RENAME: 'rename',
            SUBFOLDER: 'subfolder',
            SUBFOLDER_FORMAT: 'subfolderFormat',
            TAG_ON_TABLET: 'tagOnTablet',
            TAG_MODIFIED: 'tagModified',
            TAG_READING_LIST: 'tagReadingList',
            EXTRACT_ON_SYNC: 'extractOnSync',
            INFO_WINDOW_DURATION: 'infoWindowDuration',
            CONFIRM_BATCH: 'confirmBatch',
            BATCH_THRESHOLD: 'batchThreshold',
            PROJECT_FOLDERS: 'projectFolders'
        },

        // Preference defaults
        PREF_DEFAULTS: {
            destDir: '',
            mode: 1,
            rename: true,
            subfolder: false,
            subfolderFormat: '%a/%y',
            tagOnTablet: '_tablet',
            tagModified: '_tablet_modified',
            tagReadingList: '_reading_list',
            extractOnSync: true,
            infoWindowDuration: 4000,
            confirmBatch: true,
            batchThreshold: 5,
            projectFolders: '[]'
        },

        // Sync modes
        MODE: {
            BACKGROUND: 1,
            FOREGROUND: 2
        },

        // Processing limits
        LIMITS: {
            CONCURRENCY: 3,
            MAX_RENAME_COUNTER: 999,
            TITLE_TRUNCATE_LENGTH: 50,
            ERROR_DISPLAY_LIMIT: 5
        },

        // Error codes for consistent error handling
        ERROR_CODES: {
            // File operations
            FILE_NOT_FOUND: 'FILE_NOT_FOUND',
            COPY_FAILED: 'COPY_FAILED',
            MOVE_FAILED: 'MOVE_FAILED',
            DELETE_FAILED: 'DELETE_FAILED',
            DIR_CREATE_FAILED: 'DIR_CREATE_FAILED',

            // Sync operations
            NO_TABLET_INFO: 'NO_TABLET_INFO',
            TABLET_FILE_MISSING: 'TABLET_FILE_MISSING',
            CONFLICT_UNRESOLVED: 'CONFLICT_UNRESOLVED',
            ALREADY_ON_TABLET: 'ALREADY_ON_TABLET',
            NOT_ON_TABLET: 'NOT_ON_TABLET',

            // Annotations
            NOT_PDF: 'NOT_PDF',
            EXTRACTION_FAILED: 'EXTRACTION_FAILED',

            // Configuration
            NO_DEST_DIR: 'NO_DEST_DIR',
            INVALID_CONFIG: 'INVALID_CONFIG',

            // General
            UNKNOWN: 'UNKNOWN'
        }
    };

    Zotero.debug('ZotTablet Constants: Loaded');
})();
