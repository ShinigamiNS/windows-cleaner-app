const { exec } = require('child_process');

const OPTIMIZABLE_SERVICES = [
    { name: 'DiagTrack', displayName: 'Connected User Experiences and Telemetry', description: 'Collects and sends diagnostic data to Microsoft.' },
    { name: 'SysMain', displayName: 'SysMain (Superfetch)', description: 'Preloads apps into RAM. Can cause high disk usage on some systems.' },
    { name: 'Spooler', displayName: 'Print Spooler', description: 'Necessary for printing. Disable if you don\'t use a printer.' },
    { name: 'WSearch', displayName: 'Windows Search', description: 'Indexes files for search. Disabling slows down file search.' },
    { name: 'Fax', displayName: 'Fax', description: 'Enables sending and receiving faxes.' },
    { name: 'XblAuthManager', displayName: 'Xbox Live Auth Manager', description: 'Xbox Live authentication.' },
    { name: 'XblGameSave', displayName: 'Xbox Live Game Save', description: 'Syncs Xbox game save data.' },
    { name: 'XboxNetApiSvc', displayName: 'Xbox Live Networking Service', description: 'Xbox Live peer-to-peer connectivity.' },
    { name: 'bthserv', displayName: 'Bluetooth Support Service', description: 'Supports Bluetooth devices.' },
    { name: 'BTAGService', displayName: 'Bluetooth Audio Gateway Service', description: 'Support for Bluetooth headsets.' },
    { name: 'TermService', displayName: 'Remote Desktop Services', description: 'Allows remote connection to this computer.' },
    { name: 'RemoteRegistry', displayName: 'Remote Registry', description: 'Allows remote registry modification.' },
    { name: 'RetailDemo', displayName: 'Retail Demo Service', description: 'Retail demonstration mode.' },
    { name: 'WbioSrvc', displayName: 'Windows Biometric Service', description: 'Fingerprint/Face unlock.' },
    { name: 'MapsBroker', displayName: 'Downloaded Maps Manager', description: 'Access to downloaded maps.' },
    { name: 'PcaSvc', displayName: 'Program Compatibility Assistant Service', description: 'Monitors programs for compatibility issues.' },
    { name: 'DoSvc', displayName: 'Delivery Optimization', description: 'Optimizes Windows Update delivery.' },
    { name: 'DPS', displayName: 'Diagnostic Policy Service', description: 'Diagnoses and resolves problems.' },
    { name: 'WerSvc', displayName: 'Windows Error Reporting Service', description: 'Sends error reports to Microsoft.' },
    { name: 'TabletInputService', displayName: 'Touch Keyboard and Handwriting Panel Service', description: 'Touch keyboard and handwriting support.' }
];

function getServices() {
    return new Promise((resolve, reject) => {
        const command = 'powershell "Get-Service | Select-Object Name, DisplayName, Status, StartType | ConvertTo-Json -Compress"';
        exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error fetching services: ${error.message}`);
                reject(error);
                return;
            }
            if (stderr) {
                console.warn(`Service fetch warning: ${stderr}`);
            }

            try {
                const services = JSON.parse(stdout);

                // Filter and map to include only our optimizable services with their current status
                const result = services.filter(svc =>
                    OPTIMIZABLE_SERVICES.some(opt => opt.name.toLowerCase() === svc.Name.toLowerCase())
                ).map(svc => {
                    const info = OPTIMIZABLE_SERVICES.find(opt => opt.name.toLowerCase() === svc.Name.toLowerCase());
                    return {
                        ...svc,
                        Description: info.description
                    };
                });

                resolve(result);
            } catch (e) {
                console.error('Error parsing service JSON:', e);
                reject(e);
            }
        });
    });
}

function setServiceStatus(serviceName, startupType) {
    return new Promise((resolve, reject) => {
        // startupType should be 'Disabled' or 'Manual'
        if (!['Disabled', 'Manual', 'Automatic'].includes(startupType)) {
            reject(new Error('Invalid startup type'));
            return;
        }

        const command = `powershell "Set-Service -Name '${serviceName}' -StartupType ${startupType}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error setting service ${serviceName} to ${startupType}:`, error);
                reject(error);
                return;
            }
            resolve({ success: true, message: `Service ${serviceName} set to ${startupType}` });
        });
    });
}

function stopService(serviceName) {
    return new Promise((resolve, reject) => {
        const command = `powershell "Stop-Service -Name '${serviceName}' -Force"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                // It's possible the service is already stopped or we lack permissions
                console.warn(`Warning stopping service ${serviceName}:`, error);
                // We resolve anyway because the main goal is usually setting the startup type
                resolve({ success: false, message: error.message });
                return;
            }
            resolve({ success: true });
        });
    });
}


module.exports = { getServices, setServiceStatus, stopService };
