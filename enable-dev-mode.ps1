# Enable Developer Mode to allow symbolic links without admin privileges
# Run this script as Administrator

$registryPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock"

# Create the key if it doesn't exist
if (!(Test-Path $registryPath)) {
    New-Item -Path $registryPath -Force | Out-Null
}

# Enable Developer Mode
New-ItemProperty -Path $registryPath -Name AllowDevelopmentWithoutDevLicense -PropertyType DWORD -Value 1 -Force | Out-Null

Write-Host "Developer Mode enabled successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now build the Electron app without administrator privileges." -ForegroundColor Cyan
Write-Host "Changes will take effect immediately - no restart required." -ForegroundColor Cyan
