# ZotTablet

A Zotero 7/8 plugin for managing PDFs with external readers (tablets, e-readers, cloud storage).

ZotTablet is a successor to the abandoned ZotFile plugin, providing bidirectional PDF sync between Zotero and external folders, modification detection, and annotation extraction.

## Requirements

- Zotero 7.0+ or Zotero 8.0+
- Windows, macOS, or Linux

## Installation

1. Download the `.xpi` file from the latest release
2. In Zotero: Tools > Add-ons
3. Click the gear icon > Install Add-on From File...
4. Select the downloaded `.xpi` file
5. Restart Zotero

## Features

### PDF Synchronisation

Send PDFs to an external folder (synced via Dropbox, Google Drive, or USB) and retrieve them with changes.

| Mode | Description |
|------|-------------|
| Background (Copy) | Copies PDF to external folder, keeps original in Zotero |
| Foreground (Move) | Moves PDF to external folder, creates linked attachment |

### Modification Detection

Automatically detects when files have been modified externally. Modified files are tagged with `_tablet_modified`.

### Reading List

Tag-based reading list management. Mark items with `_reading_list` tag for later reading.

### Annotation Extraction

Import annotations made with external PDF readers (Adobe Reader, Foxit, PDF Expert, etc.) into Zotero using native PDFWorker.

## Usage

### Context Menu

Right-click on items or PDF attachments:

- Send to Tablet / Get from Tablet
- Add/Remove from Reading List
- Extract Annotations

### Tools Menu

Tools > ZotTablet:

- Sync All Modified Files
- Check All Tablet Files
- Open Tablet Folder
- Create Saved Searches
- Preferences

## Configuration

Access via Tools > ZotTablet > ZotTablet Preferences...

- Tablet/External Folder: destination for synced PDFs
- Sync Mode: Background (copy) or Foreground (move)
- File renaming: Author_Year_Title format
- Subfolder organisation
- Tag customisation
- Annotation extraction settings

## Licence

MIT License
