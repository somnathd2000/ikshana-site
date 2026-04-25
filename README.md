# Business File Finder

This is a simple desktop application that searches for files inside a business folder on your `C:` drive.

## What it does

- Lets you choose the folder to search
- Searches by part of a file name
- Shows matching files in a list
- Opens the selected file or its containing folder

## Run it

From `C:\Personal\Codex`, run:

```powershell
python app.py
```

Or double-click `launch_file_finder.bat`.

## Windows executable

A packaged Windows executable is available at:

`C:\Personal\Codex\dist\BusinessFileFinder.exe`

You can run that file directly without starting Python yourself.

To rebuild the `.exe` later, run:

```powershell
& "$env:APPDATA\Python\Python314\Scripts\pyinstaller.exe" --name BusinessFileFinder --onefile --windowed app.py
```

## Default folder

The app starts with `C:\Business` as the default search location.

If your actual business folder is somewhere else, click `Browse...` and pick the correct folder.

## Website refresh

This repo also now includes a lightweight static website refresh for Ikshana Technology:

- `index.html`
- `styles.css`
- `script.js`

## GitHub Pages

This repository includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`.

After pushing this repository to GitHub:

1. Open the repository on GitHub
2. Go to `Settings > Pages`
3. Set the source to `GitHub Actions`
4. Push to `main` to deploy the site automatically
