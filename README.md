# Sync on Save

The syncOnSave extension supports backing up files to other folders upon saving. It also supports backing up to multiple target folders. File formats can be specified using regular expressions, and it includes filtering options to exclude unwanted file formats.

## Features

- Automatically backs up files to multiple target folders upon saving.
- Supports backup configurations for multiple paths.
- File formats can be specified using regular expressions.
- Supports format filtering and regular expressions.

## Installation

1. Search for syncOnSave in the VS Code Marketplace and install it.
2. Use the syncOnSave.initConfigSyncFile command to open the configuration page and initialize the creation of the sync.json file.
3. Configure synchronization rules via the web-based UI.
4. If you are familiar with syncOnSave, you can directly edit the sync.json file manually.

## Usage

Open the syncOnSave configuration page using the syncOnSave.initConfigSyncFile command: (./resources/config_en.png)
1. Target Folder Path: Specifies the folder where you want to back up files upon saving.
2. Include Patterns (one per line): Specifies which file formats should be backed up. Rules support regular expressions.
3. Exclude Patterns (one per line): Specifies which file formats should not be backed up. Rules support regular expressions.

## Configuration
![Sample picture](./resources/config_en.png)
![Sample picture](./resources/config_cn.png)

Add the following to your sync.json:

```json
{
  "targetFolders": [
    {
      "path": ".",
      "include": ["**/*.ts", "**/*.js"],
      "exclude": ["node_modules/**"]
    }
  ],
  "syncOnSave": true,
  "createTargetFolder": true
}