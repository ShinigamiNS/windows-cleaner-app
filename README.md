# Windows Cleaner App

A powerful and premium-looking Windows cleaner application built with Electron. This tool helps you scan and remove temporary files, system logs, and other unnecessary data to free up disk space.

## Features

- **Smart Scanning**: Scans for:
  - Windows Temp Files
  - User Temp Files
  - Windows Prefetch
  - Windows Logs
  - Recycle Bin
- **Selective Cleaning**: Review scan results and choose exactly what to delete.
- **Modern UI**: Clean, responsive, and aesthetic user interface.
- **Portable**: Can be built into a standalone `.exe` file.

## Prerequisites

- Node.js (v16 or higher)
- npm (Node Package Manager)

## Development Setup

1.  **Clone the repository** (or download usage):
    ```bash
    git clone <repository-url>
    cd windows-cleaner-app
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run the application**:
    ```bash
    npm start
    ```

## Building the Executable

To package the application into a standalone `.exe` installer:

1.  Run the build command:
    ```bash
    npm run build
    ```

2.  Locate the installer in the `dist` directory:
    - `dist/windows-cleaner-app Setup 1.0.0.exe`

## License

ISC
