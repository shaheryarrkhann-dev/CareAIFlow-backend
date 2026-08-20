# AI Onboarding Platform - Windows Setup Script
# Run this in PowerShell as Administrator

Write-Host "🚀 AI Onboarding Platform - Setup Script" -ForegroundColor Cyan
Write-Host "=========================================`n" -ForegroundColor Cyan

# Function to check if command exists
function Test-CommandExists {
    param($command)
    $null = Get-Command $command -ErrorAction SilentlyContinue
    return $?
}

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
if (Test-CommandExists node) {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Node.js not found. Please install from: https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check npm
Write-Host "Checking npm..." -ForegroundColor Yellow
if (Test-CommandExists npm) {
    $npmVersion = npm --version
    Write-Host "✅ npm found: v$npmVersion" -ForegroundColor Green
} else {
    Write-Host "❌ npm not found" -ForegroundColor Red
    exit 1
}

# Check if .env exists
Write-Host "`nChecking .env file..." -ForegroundColor Yellow
if (!(Test-Path .env)) {
    Write-Host "❌ .env file not found!" -ForegroundColor Red
    Write-Host "`nPlease create a .env file. Follow these steps:" -ForegroundColor Yellow
    Write-Host "1. Open ENV_SETUP_INSTRUCTIONS.md" -ForegroundColor Cyan
    Write-Host "2. Copy the .env template" -ForegroundColor Cyan
    Write-Host "3. Create .env file in project root" -ForegroundColor Cyan
    Write-Host "4. Update DATABASE_URL, JWT secrets, and API keys" -ForegroundColor Cyan
    Write-Host "`nOr use this quick command:" -ForegroundColor Yellow
    Write-Host 'notepad .env' -ForegroundColor Cyan
    exit 1
} else {
    Write-Host "✅ .env file found" -ForegroundColor Green
}

# Check Docker
Write-Host "`nChecking Docker..." -ForegroundColor Yellow
if (Test-CommandExists docker) {
    Write-Host "✅ Docker found" -ForegroundColor Green
    
    Write-Host "`nWould you like to use Docker for PostgreSQL? (Recommended)" -ForegroundColor Yellow
    Write-Host "  [Y] Yes (Easy setup with pgvector)" -ForegroundColor Cyan
    Write-Host "  [N] No (Use existing PostgreSQL installation)" -ForegroundColor Cyan
    $useDocker = Read-Host "Choice"
    
    if ($useDocker -eq "Y" -or $useDocker -eq "y" -or $useDocker -eq "") {
        Write-Host "`nSetting up PostgreSQL with pgvector using Docker..." -ForegroundColor Yellow
        
        # Check if container already exists
        $existingContainer = docker ps -a --filter "name=ai-onboarding-db" --format "{{.Names}}"
        if ($existingContainer) {
            Write-Host "Removing existing container..." -ForegroundColor Yellow
            docker rm -f ai-onboarding-db
        }
        
        # Start container
        Write-Host "Starting PostgreSQL container..." -ForegroundColor Yellow
        docker run --name ai-onboarding-db `
            -e POSTGRES_USER=postgres `
            -e POSTGRES_PASSWORD=postgres `
            -e POSTGRES_DB=ai_onboarding_platform `
            -p 5432:5432 `
            -d pgvector/pgvector:pg16
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to start Docker container" -ForegroundColor Red
            exit 1
        }
        
        Write-Host "Waiting for PostgreSQL to start..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        
        # Create vector extension
        Write-Host "Creating pgvector extension..." -ForegroundColor Yellow
        docker exec -it ai-onboarding-db psql -U postgres -d ai_onboarding_platform -c "CREATE EXTENSION IF NOT EXISTS vector;"
        
        Write-Host "✅ PostgreSQL with pgvector is ready!" -ForegroundColor Green
        Write-Host "`nMake sure your .env has:" -ForegroundColor Yellow
        Write-Host 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_onboarding_platform"' -ForegroundColor Cyan
    }
} else {
    Write-Host "⚠️  Docker not found. Using existing PostgreSQL installation." -ForegroundColor Yellow
    Write-Host "   Make sure pgvector extension is installed!" -ForegroundColor Yellow
}

# Install dependencies
Write-Host "`nInstalling npm dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Generate Prisma Client
Write-Host "`nGenerating Prisma Client..." -ForegroundColor Yellow
npm run prisma:generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to generate Prisma Client" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Prisma Client generated" -ForegroundColor Green

# Run migrations
Write-Host "`nRunning database migrations..." -ForegroundColor Yellow
npm run prisma:migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to run migrations" -ForegroundColor Red
    Write-Host "`nTroubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check DATABASE_URL in .env file" -ForegroundColor Cyan
    Write-Host "2. Verify PostgreSQL is running" -ForegroundColor Cyan
    Write-Host "3. Test connection: psql -U postgres -d ai_onboarding_platform" -ForegroundColor Cyan
    exit 1
}
Write-Host "✅ Migrations completed" -ForegroundColor Green

# Seed database
Write-Host "`nSeeding database with test data..." -ForegroundColor Yellow
npm run prisma:seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Seeding failed (might be already seeded)" -ForegroundColor Yellow
} else {
    Write-Host "✅ Database seeded" -ForegroundColor Green
}

# Success message
Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
Write-Host "1. Start the server:" -ForegroundColor Yellow
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host "`n2. Open Swagger API Docs:" -ForegroundColor Yellow
Write-Host "   http://localhost:4000/api-docs" -ForegroundColor Cyan
Write-Host "`n3. Test login with:" -ForegroundColor Yellow
Write-Host "   Email: alirazaarif@yopmail.com" -ForegroundColor Cyan
Write-Host "   Password: Admin@12345" -ForegroundColor Cyan
Write-Host "`n4. View database:" -ForegroundColor Yellow
Write-Host "   npm run prisma:studio" -ForegroundColor Cyan

Write-Host "`n📚 Documentation:" -ForegroundColor Cyan
Write-Host "   - ENV_SETUP_INSTRUCTIONS.md - Setup guide" -ForegroundColor White
Write-Host "   - README.md - Project overview" -ForegroundColor White
Write-Host "   - RAG_FORMS_GUIDE.md - AI forms usage" -ForegroundColor White
Write-Host "   - PDF_FILLING_GUIDE.md - PDF operations" -ForegroundColor White

Write-Host "`n⚠️  Remember to update in .env:" -ForegroundColor Yellow
Write-Host "   - OPENAI_API_KEY (for AI features)" -ForegroundColor Cyan
Write-Host "   - AWS S3 credentials (for PDF storage)" -ForegroundColor Cyan
Write-Host "   - JWT secrets (for security)" -ForegroundColor Cyan

Write-Host "`n🐳 Docker Commands (if using Docker):" -ForegroundColor Cyan
Write-Host "   docker ps                        # View running containers" -ForegroundColor White
Write-Host "   docker logs ai-onboarding-db     # View logs" -ForegroundColor White
Write-Host "   docker stop ai-onboarding-db     # Stop database" -ForegroundColor White
Write-Host "   docker start ai-onboarding-db    # Start database" -ForegroundColor White

Write-Host "`n" -NoNewline


