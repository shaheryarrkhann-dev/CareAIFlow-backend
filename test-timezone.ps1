# PowerShell script to test audit trail timezone
# Usage: .\test-timezone.ps1 "YOUR_ADMIN_TOKEN"

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Testing Audit Trail Timezone Implementation (UTC+05:00)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

$url = "http://localhost:4000/api/audit/logs?limit=5"
$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

Write-Host "Endpoint: $url" -ForegroundColor Yellow
Write-Host ""

try {
    Write-Host "Fetching audit logs..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
    
    Write-Host "SUCCESS: API responded!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Checking timestamps..." -ForegroundColor Yellow
    Write-Host "------------------------------------------------------------------" -ForegroundColor Gray
    
    $allCorrect = $true
    $index = 1
    
    foreach ($log in $response.data) {
        $timestamp = $log.createdAt
        $hasCorrectFormat = $timestamp -match '\+05:00$'
        
        Write-Host ""
        Write-Host "Log $index" -ForegroundColor Cyan
        Write-Host "  ID:         $($log.id)"
        Write-Host "  Action:     $($log.action)"
        Write-Host "  Created At: $timestamp"
        
        if ($hasCorrectFormat) {
            Write-Host "  Format:     [OK] Has +05:00 timezone" -ForegroundColor Green
        } else {
            Write-Host "  Format:     [ERROR] Missing +05:00 timezone" -ForegroundColor Red
            $allCorrect = $false
        }
        
        # Check metadata timestamps
        if ($log.metadata) {
            if ($log.metadata.loginTime) {
                $metaTime = $log.metadata.loginTime
                $metaCorrect = $metaTime -match '\+05:00$'
                Write-Host "  Login Time: $metaTime"
                if ($metaCorrect) {
                    Write-Host "              [OK] Has +05:00 timezone" -ForegroundColor Green
                } else {
                    Write-Host "              [ERROR] Missing +05:00 timezone" -ForegroundColor Red
                    $allCorrect = $false
                }
            }
            if ($log.metadata.failureTime) {
                $metaTime = $log.metadata.failureTime
                $metaCorrect = $metaTime -match '\+05:00$'
                Write-Host "  Failure Time: $metaTime"
                if ($metaCorrect) {
                    Write-Host "                [OK] Has +05:00 timezone" -ForegroundColor Green
                } else {
                    Write-Host "                [ERROR] Missing +05:00 timezone" -ForegroundColor Red
                    $allCorrect = $false
                }
            }
        }
        
        $index++
    }
    
    Write-Host ""
    Write-Host "------------------------------------------------------------------" -ForegroundColor Gray
    Write-Host ""
    
    if ($allCorrect) {
        Write-Host "==================================================================" -ForegroundColor Green
        Write-Host "  SUCCESS: All timestamps are in UTC+05:00 format!" -ForegroundColor Green
        Write-Host "==================================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "The timezone implementation is working correctly." -ForegroundColor Green
    } else {
        Write-Host "==================================================================" -ForegroundColor Red
        Write-Host "  ISSUE: Some timestamps are NOT in UTC+05:00 format" -ForegroundColor Red
        Write-Host "==================================================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Troubleshooting steps:" -ForegroundColor Yellow
        Write-Host "1. Restart the server: npm run dev"
        Write-Host "2. Ensure code files are saved"
        Write-Host "3. Wait a few seconds and try again"
    }
    
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to fetch audit logs" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error Details:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Is the server running? (npm run dev)"
    Write-Host "2. Is the token valid?"
    Write-Host "3. Do you have ADMIN or SUPER_ADMIN role?"
    Write-Host ""
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan

