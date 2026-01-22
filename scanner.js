const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Helper to get environment variables safely
const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const TEMP = os.tmpdir();
const WINDIR = process.env.SystemRoot || 'C:\\Windows';

// --- Scan Definitions ---
const SCAN_DEFINITIONS = {
    system: [
        { id: 'sys_temp', name: 'Temporary Files', paths: [TEMP, path.join(WINDIR, 'Temp')] },
        { id: 'sys_recycle', name: 'Recycle Bin', paths: [], action: 'empty_recycle_bin' },
        { id: 'sys_clipboard', name: 'Clipboard', paths: [], action: 'clear_clipboard' },
        { id: 'sys_prefetch', name: 'Prefetch', paths: [path.join(WINDIR, 'Prefetch')] },
        { id: 'sys_muicache', name: 'MUI Cache', paths: [path.join(LOCALAPPDATA, 'Microsoft', 'Windows', 'Caches')] },
        { id: 'sys_logs', name: 'Windows Logs', paths: [path.join(WINDIR, 'Logs'), path.join(WINDIR, 'Debug')] },
        { id: 'explorer_mru', name: 'Windows Explorer MRU', paths: [path.join(APPDATA, 'Microsoft', 'Windows', 'Recent')] },
        { id: 'explorer_thumb', name: 'Thumbnail Cache', paths: [path.join(LOCALAPPDATA, 'Microsoft', 'Windows', 'Explorer')], pattern: /thumbcache_.*\.db$/ },
        { id: 'defender', name: 'Windows Defender', paths: [path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows Defender', 'Scans', 'History', 'Results')] }
    ],
    applications: [
        { id: 'app_chrome', name: 'Google Chrome', paths: [path.join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'), path.join(LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default', 'Code Cache')] },
        { id: 'app_firefox', name: 'Firefox', paths: [path.join(LOCALAPPDATA, 'Mozilla', 'Firefox', 'Profiles')] },
        { id: 'app_edge', name: 'Microsoft Edge', paths: [path.join(LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache')] },
        { id: 'app_vlc', name: 'VLC Media Player', paths: [path.join(APPDATA, 'vlc', 'art')] },
        { id: 'app_winrar', name: 'WinRAR', paths: [] },
        { id: 'app_adobe', name: 'Adobe Reader', paths: [path.join(LOCALAPPDATA, 'Adobe', 'Acrobat', 'DC', 'Cache')] }
    ],
    deepscan: [
        { id: 'deep_temp', name: 'Deep Temp Clean', paths: [TEMP], deep: true, pattern: /\.(tmp|bak|log|chk|old)$/i }
    ],
    registry: [
        { id: 'reg_activex', name: 'ActiveX/COM Components', paths: [], registry: true, key: 'HKCR\\CLSID' },
        { id: 'reg_software', name: 'Software Paths', paths: [], registry: true, key: 'HKLM\\SOFTWARE' },
        { id: 'reg_apppaths', name: 'Application Paths', paths: [], registry: true, key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths', checkFile: true },
        // NEW: Compatibility Assistant (Value Name = Path)
        { id: 'reg_appcompat', name: 'Application Compatibility', paths: [], registry: true, key: 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Compatibility Assistant\\Store', checkValueName: true },
        { id: 'reg_filetypes', name: 'File Types', paths: [], registry: true, key: 'HKCR' },
        { id: 'reg_help', name: 'Help Files', paths: [], registry: true, key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\Help' },
        { id: 'reg_firewall', name: 'Firewall Settings', paths: [], registry: true },
        { id: 'reg_fonts', name: 'Fonts', paths: [], registry: true, key: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts' },
        { id: 'reg_dlls', name: 'Shared DLLs', paths: [], registry: true, key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs', checkFile: true },
        { id: 'reg_mru', name: 'User MRU Lists', paths: [], registry: true },
        { id: 'reg_uninstall', name: 'Uninstaller', paths: [], registry: true, key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },
        { id: 'reg_startup', name: 'Startup Programs', paths: [], registry: true, key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', checkFile: true },
        // NEW: MuiCache (often Value Name = Path)
        { id: 'reg_muicache', name: 'MUI Cache', paths: [], registry: true, key: 'HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache', checkValueName: true },
        { id: 'reg_services', name: 'Windows Services', paths: [], registry: true },
        { id: 'reg_context', name: 'Invalid Context Menu Items', paths: [], registry: true }
    ]
};

// --- Post-Process Path Helpers ---

function expandEnv(pathStr) {
    return pathStr.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
}

function extractPathFromValue(valueData) {
    if (!valueData) return null;
    let clean = valueData.replace(/^"/, '');

    // Heuristic: If it starts with a drive letter, take it essentially as is (up to extension or end)
    if (clean.match(/^[a-zA-Z]:\\/) || clean.startsWith('\\\\')) {
        let pathPart = clean;
        // Split by common arg delimiters if present AFTER a valid extension
        const extMatch = clean.match(/\.(exe|dll|sys|ocx|bat|cmd|scr)/i);
        if (extMatch) {
            // Cut at end of extension + regex match length?
            // "C:\Path\To\File.exe /arg" -> "C:\Path\To\File.exe"
            const idx = extMatch.index + extMatch[0].length;
            pathPart = clean.substring(0, idx);
        }
        // Handle "C:\Path No Ext" (rare but possible for folders)
        else if (clean.includes(' /')) {
            pathPart = clean.split(' /')[0];
        }

        // Remove trailing quotes if any
        pathPart = pathPart.replace(/"$/, '');
        return expandEnv(pathPart.trim());
    }
    return null;
}

// --- Scanning Functions (File System) ---

async function scanFiles(config) {
    const results = [];

    const processDef = async (category, def) => {
        if (config && !config[def.id]) return;

        if (def.paths && def.paths.length > 0) {
            for (const p of def.paths) {
                try {
                    await scanPath(p, results, category, def.name, def.pattern, def.deep);
                } catch (e) { }
            }
        }

        if (def.action) {
            results.push({
                path: def.action === 'empty_recycle_bin' ? 'Empty Recycle Bin' : 'Clear Clipboard',
                size: 0,
                type: 'action',
                category: category,
                group: def.name,
                actionId: def.action,
                checked: true
            });
        }
    };

    for (const def of SCAN_DEFINITIONS.system) await processDef('System', def);
    for (const def of SCAN_DEFINITIONS.applications) await processDef('Applications', def);
    for (const def of SCAN_DEFINITIONS.deepscan) await processDef('Deep Scan', def);

    return results;
}

async function scanPath(dirPath, results, category, group, pattern = null, deep = false) {
    try {
        const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const dirent of files) {
            const fullPath = path.join(dirPath, dirent.name);

            if (dirent.isDirectory()) {
                if (deep) {
                    await scanPath(fullPath, results, category, group, pattern, deep);
                } else if (group === 'Firefox') {
                    await scanPath(fullPath, results, category, group, pattern, true);
                }
            } else {
                if (pattern && !pattern.test(dirent.name)) continue;
                try {
                    const stats = await fs.promises.stat(fullPath);
                    results.push({
                        path: fullPath,
                        size: stats.size,
                        type: 'file',
                        category: category,
                        group: group,
                        checked: true
                    });
                } catch (e) { }
            }
        }
    } catch (e) { }
}

// --- Scanning Functions (Registry) ---

async function scanRegistry(config) {
    const results = [];

    // Helper to query registry
    const queryReg = async (key) => {
        try {
            const { stdout } = await execPromise(`reg query "${key}" /s`);
            return stdout;
        } catch (e) {
            return '';
        }
    };

    const processReg = async (def) => {
        if (config && !config[def.id]) return;
        if (!def.key) return; // Skip if no key defined yet

        try {
            const output = await queryReg(def.key);
            if (!output) return;

            const lines = output.split('\r\n');
            let currentKey = def.key;

            for (const line of lines) {
                if (!line) continue;

                // HACK: Handle the line structure from reg query

                if (line.trim().startsWith('HKEY_')) {
                    currentKey = line.trim();
                    continue;
                }

                // Parse: Name    Type    Data
                // Data might be empty.
                const parts = line.trim().match(/^(.+?)\s{4}(REG_\w+)\s{4}(.*)$/);

                if (parts) {
                    const valueName = parts[1];
                    const valueType = parts[2];
                    const valueData = parts[3];

                    let pToCheck = null;

                    // 1. Check Value Data (standard)
                    if (def.checkFile) {
                        pToCheck = extractPathFromValue(valueData);
                    }
                    // 2. Check Value Name (for AppCompatFlags / MuiCache)
                    else if (def.checkValueName) {
                        // Value Name IS the path often
                        pToCheck = valueName;
                        // Skip special names
                        if (valueName.startsWith('@') || valueName === '(Default)') continue;
                        // Handle "FriendlyName" suffix logic if needed? 
                        // For AppCompat, it's just the full path.
                    }

                    if (pToCheck) {
                        // Basic validity check
                        if (!pToCheck.match(/^[a-zA-Z]:\\/) && !pToCheck.startsWith('\\\\')) {
                            continue;
                        }

                        try {
                            await fs.promises.access(pToCheck);
                            // Exists -> Valid
                        } catch (err) {
                            // Missing -> Invalid
                            results.push({
                                path: `${currentKey}\\${valueName}`,
                                value: valueName,
                                data: valueData,
                                missingFile: pToCheck,
                                size: 0,
                                type: 'registry',
                                category: 'Registry',
                                group: def.name,
                                checked: true,
                                regKey: currentKey,
                                regValue: valueName
                            });
                        }
                    } else if (def.id === 'reg_fonts' && valueData && !valueData.endsWith('.ttf')) {
                        // Font logic stub
                    }
                }
            }
        } catch (e) {
            // console.error(`Error scanning reg ${def.name}:`, e);
        }
    };

    for (const def of SCAN_DEFINITIONS.registry) await processReg(def);

    return results;
}

// --- Deletion Functions ---

async function backupRegistry(key, value) {
    try {
        const backupDir = path.join(__dirname, 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeName = key.replace(/[\\]/g, '_').substring(0, 50);
        const filename = path.join(backupDir, `backup_${safeName}_${timestamp}.reg`);

        await execPromise(`reg export "${key}" "${filename}" /y`);
        return true;
    } catch (e) {
        console.error('Backup failed:', e);
        return false;
    }
}

async function deleteItems(items, options = { backup: false }) {
    let deletedCount = 0;
    let freedSpace = 0;

    for (const item of items) {
        if (!item.checked) continue;

        try {
            if (item.type === 'file') {
                await fs.promises.unlink(item.path);
                deletedCount++;
                freedSpace += item.size;
            } else if (item.type === 'action') {
                deletedCount++;
            } else if (item.type === 'registry') {
                if (options.backup) {
                    await backupRegistry(item.regKey, item.regValue);
                }
                await execPromise(`reg delete "${item.regKey}" /v "${item.regValue}" /f`);
                deletedCount++;
            }
        } catch (e) {
            console.error(`Failed to delete ${item.path}:`, e.message);
        }
    }
    return { count: deletedCount, space: freedSpace };
}

module.exports = { scanFiles, scanRegistry, deleteItems, SCAN_DEFINITIONS };
