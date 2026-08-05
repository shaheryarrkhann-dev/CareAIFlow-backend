# Script to download Dancing Script SemiBold font
$fontUrl = "https://github.com/google/fonts/raw/main/ofl/dancingscript/DancingScript-SemiBold.ttf"
$fontDir = "src/fonts"
$fontPath = Join-Path $fontDir "DancingScript-SemiBold.ttf"

# Create fonts directory if it doesn't exist
if (-not (Test-Path $fontDir)) {
    New-Item -ItemType Directory -Path $fontDir -Force | Out-Null
    Write-Host "Created fonts directory: $fontDir"
}

# Download the font
Write-Host "Downloading Dancing Script SemiBold font..."
try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $fontUrl -OutFile $fontPath -UseBasicParsing -ErrorAction Stop
    Write-Host "✅ Successfully downloaded font to: $fontPath"
    
    # Verify the file exists and has content
    if (Test-Path $fontPath) {
        $fileSize = (Get-Item $fontPath).Length
        Write-Host "Font file size: $fileSize bytes"
    }
} catch {
    Write-Host "❌ Error downloading font: $_"
    Write-Host ""
    Write-Host "Alternative: Please manually download the font from:"
    Write-Host "https://fonts.google.com/specimen/Dancing+Script"
    Write-Host "Select 'SemiBold' weight and download the TTF file"
    Write-Host "Then place it at: $fontPath"
    exit 1
}


