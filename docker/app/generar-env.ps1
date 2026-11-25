# Genera el .env de PALCO a partir de .env.example, con claves nuevas de un
# generador criptografico. Lo llama PALCO.bat solo si todavia no existe un .env.
# Compatible con Windows PowerShell 5.1.
param([string]$Root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))

$ErrorActionPreference = 'Stop'
$example = Join-Path $Root '.env.example'
$target = Join-Path $Root '.env'

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
function New-Bytes([int]$count) {
  $bytes = New-Object byte[] $count
  $rng.GetBytes($bytes)
  return $bytes
}
function New-Hex([int]$count) { return (-join ((New-Bytes $count) | ForEach-Object { $_.ToString('x2') })) }
function New-Base64([int]$count) { return [Convert]::ToBase64String((New-Bytes $count)) }

$admin = New-Hex 24
$app = New-Hex 24
$reader = New-Hex 24
$values = @{
  'POSTGRES_PASSWORD'        = $admin
  'PALCO_APP_PASSWORD'       = $app
  'PALCO_LECTOR_PASSWORD'    = $reader
  'NUXT_DATABASE_URL'        = "postgres://palco_app:$app@db:5432/palco"
  'NUXT_DATABASE_READER_URL' = "postgres://palco_lector:$reader@db:5432/palco"
  'NUXT_DATABASE_ADMIN_URL'  = "postgres://palco_admin:$admin@db:5432/palco"
  'NUXT_SESSION_PASSWORD'    = New-Base64 32
  'NUXT_TICKET_SIGNING_KEY'  = New-Base64 32
  'NUXT_GATE_PIN'            = New-Hex 4
}

$lines = [System.IO.File]::ReadAllText($example) -split "`n" | ForEach-Object {
  $line = $_.TrimEnd("`r")
  if ($line -match '^([A-Z_]+)=$' -and $values.ContainsKey($Matches[1])) { "$($Matches[1])=$($values[$Matches[1]])" } else { $line }
}

# UTF-8 sin BOM y con saltos LF: Docker Compose leeria un BOM o un \r como parte del valor.
[System.IO.File]::WriteAllText($target, (($lines -join "`n").TrimEnd("`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
$rng.Dispose()
Write-Host 'Se genero .env con claves nuevas.'
