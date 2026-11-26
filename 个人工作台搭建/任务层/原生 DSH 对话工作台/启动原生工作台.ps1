$ErrorActionPreference = 'Stop'
$board = 'http://127.0.0.1:48732'
$web = 'http://127.0.0.1:48733'
$vaultRoot = (Get-Item -LiteralPath (Join-Path $PSScriptRoot '../../..')).FullName
$boardDir = Join-Path $PSScriptRoot '../搭 MVP 原型/H5看板'
$cli = Join-Path $(if ($env:DSH_INSTALL_DIR) { $env:DSH_INSTALL_DIR } else { 'D:/DSH' }) 'resources/runtime/cli/bin/dsh.cmd'
if (!(Test-Path -LiteralPath $cli)) { throw '请通过 DSH_INSTALL_DIR 指定本机 DSH 安装目录。' }
$env:PROJECT_VAULT = $vaultRoot
try { $null = Invoke-RestMethod "$board/api" -TimeoutSec 2 }
catch {
  Start-Process node.exe -WorkingDirectory $boardDir -ArgumentList 'server.mjs' -WindowStyle Hidden
  $ready = $false
  for ($i=0;$i -lt 20;$i++) {
    Start-Sleep -Milliseconds 300
    try { $null=Invoke-RestMethod "$board/api" -TimeoutSec 2; $ready=$true;break } catch {}
  }
  if (!$ready) { throw '项目看板服务启动失败。' }
}
$profileRoot=Join-Path $(if($env:DSH_HOME){$env:DSH_HOME}else{Join-Path $env:USERPROFILE '.dsh'}) 'profiles/personal-workspace'
$package=Join-Path $PSScriptRoot 'personal-workspace-native-0.1.2.tgz'
if (!(Test-Path -LiteralPath "$profileRoot/package.json")) {
  New-Item -Type Directory -Force $profileRoot | Out-Null
  '{"name":"personal-workspace-profile","private":true,"dsh":{"profile":{"bundles":["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app","personal-workspace-native"]}}}' | Set-Content -Encoding ascii "$profileRoot/package.json"
}
$manifest=Get-Content -LiteralPath "$profileRoot/package.json" -Raw | ConvertFrom-Json
if ($manifest.name -ne 'personal-workspace-profile') { throw '同名 DSH 配置已存在，请检查后再启动。' }
$hash=(Get-FileHash -LiteralPath $package).Hash
$stamp="$profileRoot/.native-package-hash"
if (!(Test-Path $stamp) -or (Get-Content $stamp) -ne $hash -or !(Test-Path "$profileRoot/node_modules/personal-workspace-native/index.js")) {
  & npm.cmd install --prefix $profileRoot --legacy-peer-deps --no-audit --no-fund $package
  if ($LASTEXITCODE -ne 0) { throw '安装独立工作台插件失败。' }
  $hash | Set-Content $stamp
}
if (Get-NetTCPConnection -State Listen -LocalPort 48733 -ErrorAction SilentlyContinue) {
  Start-Process "$web/#workbench"
} else {
  & $cli --profile personal-workspace --host 127.0.0.1 --port 48733
  if ($LASTEXITCODE -ne 0) { throw 'DSH 原生工作台启动失败。' }
}
