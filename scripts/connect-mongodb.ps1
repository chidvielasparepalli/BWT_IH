# Connect HarvestLink directly to MongoDB Atlas. URI is accepted using hidden input
# and only written to backend/.env; do not paste it into chat.
$ErrorActionPreference = 'Stop'
$root = 'A:\harvestlink'
$backend = Join-Path $root 'backend'
if (-not (Test-Path (Join-Path $backend 'package.json'))) { throw "HarvestLink backend not found at $backend" }

Write-Host ''
Write-Host 'HarvestLink - MongoDB Atlas setup' -ForegroundColor Cyan
Write-Host '1. In Atlas, open CHIDVI > Connect > Drivers > JavaScript / Node.js Driver.'
Write-Host '2. Copy the URI. Make sure the database user exists and this IP is allowed in Network Access.'
Write-Host '3. Enter the full URI below. The text will not be displayed.'
Write-Host ''

$secure = Read-Host 'MongoDB connection URI (hidden input)' -AsSecureString
$ptr = [IntPtr]::Zero
try {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $mongoUri = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ($secure) { $secure.Dispose() }
}
if ([string]::IsNullOrWhiteSpace($mongoUri) -or $mongoUri -notmatch '^mongodb(\+srv)?://') {
  throw 'That does not look like a MongoDB URI. It should start with mongodb+srv:// or mongodb://.'
}
# Atlas's copied sample usually contains <db_password>. Ask for that password separately,
# hidden, and URL-encode it automatically so special characters do not break the URI.
if ($mongoUri -match '(<db_password>|<password>)') {
  $passwordSecure = Read-Host 'MongoDB database-user password (hidden input)' -AsSecureString
  $passwordPtr = [IntPtr]::Zero
  try {
    $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    $rawPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
  } finally {
    if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr) }
    if ($passwordSecure) { $passwordSecure.Dispose() }
  }
  $encodedPassword = [Uri]::EscapeDataString($rawPassword)
  $mongoUri = $mongoUri.Replace('<db_password>', $encodedPassword).Replace('<password>', $encodedPassword)
  $rawPassword = $null
}
if ($mongoUri -match '[\r\n\s<>]') { throw 'The URI still contains a placeholder or whitespace. Copy the connection string from Atlas again.' }

$dbName = Read-Host 'Database name [harvestlink]'
if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = 'harvestlink' }
if ($dbName -notmatch '^[a-zA-Z0-9_-]{1,60}$') { throw 'Use a database name containing only letters, numbers, underscores, or hyphens.' }

# Generate a private API signing secret locally; the user does not need to invent one.
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
$rng.Dispose()
$tokenSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
[Array]::Clear($bytes, 0, $bytes.Length)

$backendEnvPath = Join-Path $backend '.env'
$frontendEnvPath = Join-Path $root '.env.local'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($file in @($backendEnvPath, $frontendEnvPath)) {
  if (Test-Path $file) {
    Copy-Item -LiteralPath $file -Destination ($file + '.backup-' + $timestamp)
    Write-Host ("Backed up existing configuration: " + [IO.Path]::GetFileName($file)) -ForegroundColor Yellow
  }
}
$backendEnv = @(
  'PORT=4000',
  "MONGODB_URI=$mongoUri",
  "MONGODB_DB=$dbName",
  "TOKEN_SECRET=$tokenSecret",
  'CORS_ORIGINS=http://localhost:5173'
) -join "`r`n"
$frontendEnv = @(
  '# Frontend calls the local HarvestLink API; no Firebase setup is required.',
  'VITE_API_BASE_URL=http://localhost:4000'
) -join "`r`n"
[IO.File]::WriteAllText($backendEnvPath, $backendEnv + "`r`n", [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($frontendEnvPath, $frontendEnv + "`r`n", [Text.UTF8Encoding]::new($false))
Write-Host ''
Write-Host 'Configuration saved locally. URI and API secret were not printed.' -ForegroundColor Green
Write-Host 'Testing MongoDB Atlas connectivity...' -ForegroundColor Cyan
Push-Location $backend
try {
  node .\scripts\ping-mongodb.js
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host 'Configuration is saved, but connection failed. Check Atlas Network Access, database username/password, and URI.' -ForegroundColor Yellow
    exit $LASTEXITCODE
  }
} finally { Pop-Location }
Write-Host ''
Write-Host 'Atlas connection succeeded!' -ForegroundColor Green
Write-Host 'Next: start the API with "npm run api", then start the app with "npm run dev" in a second terminal.' -ForegroundColor Cyan
