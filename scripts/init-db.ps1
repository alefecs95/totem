# Inicializa o banco totem_festival no PostgreSQL local.
# Execute como Administrador no PowerShell:
#   Set-ExecutionPolicy -Scope Process Bypass; .\scripts\init-db.ps1

$ErrorActionPreference = 'Stop'
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$hbaPath = 'C:\Program Files\PostgreSQL\17\data\pg_hba.conf'
$psql = Join-Path $pgBin 'psql.exe'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$dataDir = 'C:\Program Files\PostgreSQL\17\data'

if (-not (Test-Path $psql)) {
  Write-Error 'PostgreSQL 17 nao encontrado. Instale com: winget install PostgreSQL.PostgreSQL.17'
}

Write-Host 'Configurando autenticacao local (trust) temporariamente...'
$hba = Get-Content $hbaPath -Raw
if ($hba -notmatch 'totem-dev-trust') {
  $trustLine = "# totem-dev-trust`nhost    all             all             127.0.0.1/32            trust`n"
  $hba = $hba -replace '(# TYPE  DATABASE)', "$trustLine`$1"
  Set-Content -Path $hbaPath -Value $hba -Encoding UTF8
  & $pgCtl reload -D $dataDir
  Start-Sleep -Seconds 2
}

Write-Host 'Criando usuario e banco...'
$sql = @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'totem_user') THEN
    CREATE USER totem_user WITH PASSWORD 'totem_dev';
  END IF;
END `$`$;
SELECT 'CREATE DATABASE totem_festival OWNER totem_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'totem_festival')\gexec
GRANT ALL PRIVILEGES ON DATABASE totem_festival TO totem_user;
"@

& $psql -U postgres -h 127.0.0.1 -d postgres -c $sql

Write-Host ''
Write-Host 'Banco pronto!'
Write-Host 'DATABASE_URL=postgresql://totem_user:totem_dev@localhost:5432/totem_festival'
Write-Host ''
Write-Host 'Agora rode na raiz do projeto: npm run dev'
