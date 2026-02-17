const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Defensive check: If we are running in Node (not Electron), we might catch it here.
if (!app) {
    console.error('CRITICAL ERROR: Application execution failed. Please ensure you are running with "electron ." or "npm start".');
    process.exit(1);
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true,
        backgroundColor: '#f3f3f3',
        icon: path.join(__dirname, 'icon.png') // Optional
    });

    mainWindow.loadFile('index.html');
}

// Handlers
ipcMain.handle('scan-system', async () => {
    try {
        const { scanSystem } = require('./scanner');
        return await scanSystem();
    } catch (error) {
        console.error('Scan Error:', error);
        return [];
    }
});

// Service Management Handlers
ipcMain.handle('get-services', async () => {
    try {
        const { getServices } = require('./services');
        return await getServices();
    } catch (error) {
        console.error('Service Fetch Error:', error);
        return []; // Return empty array on error
    }
});

ipcMain.handle('set-service-startup', async (event, serviceName, startupType) => {
    try {
        const { setServiceStatus } = require('./services');
        return await setServiceStatus(serviceName, startupType);
    } catch (error) {
        console.error('Service Modify Error:', error);
        throw error;
    }
});

ipcMain.handle('stop-service', async (event, serviceName) => {
    try {
        const { stopService } = require('./services');
        return await stopService(serviceName);
    } catch (error) {
        console.error('Service Stop Error:', error);
        // Return success: false, but don't throw to avoid crashing UI logic if permission issues occur
        return { success: false, message: error.message };
    }
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
