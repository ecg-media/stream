# Installs or updates the stream server on Windows 10/11 and starts it automatically with the computer.
#   - downloads the newest version from GitHub (or uses the folder this script is in, when it is a full copy)
#   - installs its own Node.js (official zip from nodejs.org, checksum verified) into %ProgramFiles%\ecg-stream\node
#   - Windows service "EcgStream" (automatic start, restart after a crash, log in %ProgramData%\ecg-stream\server.log)
#   - firewall rules for the web and media ports, limited to the local network
# Settings, channels and statistics in %ProgramData%\ecg-stream are kept on updates.
# Usage (asks for administrator rights): install-windows.cmd [-Update] [-Uninstall] [-Port 80] [-RtcPort 10000] [-Ip 192.168.1.10]
param(
  [switch]$Update,
  [switch]$Uninstall,
  [ValidateRange(1, 65535)][int]$Port = 80,
  [ValidateRange(1, 65535)][int]$RtcPort = 10000,
  [ValidatePattern('^$|^[0-9.]+$')][string]$Ip = '',
  [ValidatePattern('^[A-Za-z0-9._/-]+$')][string]$Ref = 'main'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# The service wrapper is compiled with the .NET Framework, which only Windows PowerShell 5.1 provides.
$identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $PSVersionTable.PSEdition -eq 'Core') {
  if (-not $PSCommandPath) { throw 'Bitte PowerShell als Administrator starten und den Befehl erneut ausführen.' }
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', "`"$PSCommandPath`"")
  foreach ($p in $PSBoundParameters.GetEnumerator()) {
    if ($p.Value -is [switch]) { if ($p.Value) { $argList += "-$($p.Key)" } } else { $argList += "-$($p.Key)", "$($p.Value)" }
  }
  Start-Process "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Verb RunAs -ArgumentList $argList
  exit
}

$Repo = 'https://github.com/ecg-media/stream'
$NodeMajor = 26
$InstallDir = Join-Path $env:ProgramFiles 'ecg-stream'
$AppDir = Join-Path $InstallDir 'app'
$NodeDir = Join-Path $InstallDir 'node'
$DataDir = Join-Path $env:ProgramData 'ecg-stream'
$ServiceName = 'EcgStream'
$FirewallGroup = 'ECG Stream'

$ServiceSource = @'
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;

public class EcgStreamService : ServiceBase
{
    static string node, appDir, logFile;
    readonly object logLock = new object();
    Process server;
    volatile bool stopping;

    public static void Main(string[] args)
    {
        node = args[0];
        appDir = args[1];
        logFile = Path.Combine(Environment.GetEnvironmentVariable("DATA_DIR"), "server.log");
        ServiceBase.Run(new EcgStreamService { ServiceName = "EcgStream" });
    }

    protected override void OnStart(string[] startArgs)
    {
        try
        {
            if (new FileInfo(logFile).Length > 1048576)
            {
                File.Delete(logFile + ".old");
                File.Move(logFile, logFile + ".old");
            }
        }
        catch (IOException) { }
        var info = new ProcessStartInfo(node, @"server\index.js")
        {
            WorkingDirectory = appDir,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        server = new Process { StartInfo = info, EnableRaisingEvents = true };
        server.OutputDataReceived += (s, e) => Log(e.Data);
        server.ErrorDataReceived += (s, e) => Log(e.Data);
        server.Exited += (s, e) =>
        {
            if (stopping) return;
            Log("Server exited with code " + server.ExitCode + "; the service is restarted by Windows.");
            Environment.Exit(1);
        };
        server.Start();
        server.BeginOutputReadLine();
        server.BeginErrorReadLine();
    }

    protected override void OnStop()
    {
        stopping = true;
        try
        {
            if (!server.HasExited)
            {
                server.Kill();
                server.WaitForExit(5000);
            }
        }
        catch (InvalidOperationException) { }
        catch (Win32Exception) { }
    }

    void Log(string line)
    {
        if (line == null) return;
        lock (logLock)
        {
            try { File.AppendAllText(logFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + line + Environment.NewLine); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }
}
'@

function Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }

function Invoke-Checked([string]$Exe) {
  & $Exe @args
  if ($LASTEXITCODE) { throw "$Exe $args ist fehlgeschlagen (Code $LASTEXITCODE)." }
}

# Copies a folder with robocopy, whose exit codes below 8 mean success.
function Copy-Tree([string]$From, [string]$To) {
  & robocopy.exe $From $To /E /NFL /NDL /NJH /NJS /NP @args | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Kopieren nach $To ist fehlgeschlagen (Code $LASTEXITCODE)." }
  $global:LASTEXITCODE = 0
}

function Remove-StreamService {
  $service = Get-Service $ServiceName -ErrorAction SilentlyContinue
  if ($service) {
    if ($service.Status -ne 'Stopped') { Stop-Service $ServiceName -Force }
    Invoke-Checked sc.exe delete $ServiceName | Out-Null
    for ($i = 0; $i -lt 20 -and (Get-Service $ServiceName -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 250 }
  }
}

if ($Uninstall) {
  Step 'Stream wird entfernt'
  Remove-StreamService
  Get-NetFirewallRule -Group $FirewallGroup -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "Programm entfernt. Ihre Einstellungen und Statistiken liegen weiterhin in $DataDir (bei Bedarf selbst löschen)."
  exit
}

[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$tmp = Join-Path $env:TEMP "ecg-stream-$([guid]::NewGuid())"
New-Item -ItemType Directory $tmp | Out-Null
try {
  # ---- Node.js ----
  Step "Node.js $NodeMajor wird geprüft"
  $arch = if ("$env:PROCESSOR_ARCHITEW6432 $env:PROCESSOR_ARCHITECTURE" -match 'ARM64') { 'arm64' } else { 'x64' }
  $nodeBase = "https://nodejs.org/dist/latest-v$NodeMajor.x"
  Invoke-WebRequest "$nodeBase/SHASUMS256.txt" -OutFile "$tmp\SHASUMS256.txt" -UseBasicParsing
  $match = [regex]::Match((Get-Content "$tmp\SHASUMS256.txt" -Raw), "(?m)^([0-9a-f]{64})\s+(node-v[\d.]+-win-$arch)\.zip\s*$")
  if (-not $match.Success) { throw "Kein Node.js $NodeMajor für win-$arch gefunden." }
  $nodeName = $match.Groups[2].Value
  $versionFile = Join-Path $NodeDir '.version'
  $nodeChanged = -not ((Test-Path $versionFile) -and (Get-Content $versionFile -Raw).Trim() -eq $nodeName)
  if ($nodeChanged) {
    Write-Host "Lade $nodeName.zip ..."
    Invoke-WebRequest "$nodeBase/$nodeName.zip" -OutFile "$tmp\node.zip" -UseBasicParsing
    if ((Get-FileHash "$tmp\node.zip" -Algorithm SHA256).Hash -ne $match.Groups[1].Value) { throw "Prüfsumme von $nodeName.zip stimmt nicht." }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory("$tmp\node.zip", "$tmp\node")
  }

  # ---- program files ----
  Step 'Programm wird geladen'
  $local = if ($PSScriptRoot) { Join-Path $PSScriptRoot '..' } else { $null }
  if (-not $Update -and $local -and (Test-Path (Join-Path $local 'server\index.js')) -and ((Resolve-Path $local).Path -ne $AppDir)) {
    $src = (Resolve-Path $local).Path
    Write-Host "Verwende die Dateien aus $src"
  } else {
    Invoke-WebRequest "$Repo/archive/$Ref.zip" -OutFile "$tmp\stream.zip" -UseBasicParsing
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory("$tmp\stream.zip", "$tmp\src")
    $src = (Get-ChildItem "$tmp\src" -Directory | Select-Object -First 1).FullName
  }
  if (-not (Test-Path (Join-Path $src 'server\index.js'))) { throw 'Die heruntergeladenen Dateien sind unvollständig.' }
  $newApp = Join-Path $tmp 'app'
  Copy-Tree $src $newApp '/XD' 'node_modules' 'data' '.git'

  Step 'Abhängigkeiten werden installiert'
  $nodeExe = if ($nodeChanged) { Join-Path (Get-ChildItem "$tmp\node" -Directory | Select-Object -First 1).FullName 'node.exe' } else { Join-Path $NodeDir 'node.exe' }
  $npmCli = Join-Path (Split-Path $nodeExe) 'node_modules\npm\bin\npm-cli.js'
  Push-Location $newApp
  try {
    & $nodeExe $npmCli ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE) { throw 'npm ci ist fehlgeschlagen.' }
    $worker = 'node_modules\mediasoup\worker\out\Release\mediasoup-worker.exe'
    if (-not (Test-Path $worker)) { Push-Location 'node_modules\mediasoup'; & $nodeExe npm-scripts.mjs postinstall; Pop-Location }
    if (-not (Test-Path $worker)) { throw 'Der Medienserver (mediasoup) konnte nicht installiert werden.' }
  } finally {
    Pop-Location
  }

  # ---- service ----
  Step 'Dienst wird eingerichtet'
  Remove-StreamService
  New-Item -ItemType Directory $InstallDir, $DataDir -Force | Out-Null
  if ($nodeChanged) {
    if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
    Copy-Tree (Split-Path $nodeExe) $NodeDir
    Set-Content $versionFile $nodeName
  }
  if (Test-Path $AppDir) { Remove-Item $AppDir -Recurse -Force }
  Copy-Tree $newApp $AppDir
  # The service runs as SYSTEM: only administrators and SYSTEM may change the program and data folders.
  foreach ($dir in @($InstallDir, $DataDir)) {
    Invoke-Checked icacls.exe $dir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' /T /C /Q | Out-Null
  }
  Invoke-Checked icacls.exe $DataDir /remove:g '*S-1-5-32-545' /T /C /Q | Out-Null

  $exe = Join-Path $InstallDir 'EcgStreamService.exe'
  Remove-Item $exe -ErrorAction SilentlyContinue
  Add-Type -TypeDefinition $ServiceSource -Language CSharp -OutputAssembly $exe -OutputType ConsoleApplication -ReferencedAssemblies System.ServiceProcess
  $nodePath = Join-Path $NodeDir 'node.exe'
  New-Service -Name $ServiceName -BinaryPathName "`"$exe`" `"$nodePath`" `"$AppDir`"" -DisplayName 'ECG Stream' -StartupType Automatic | Out-Null
  Set-Service $ServiceName -Description 'Audio-Übertragung für das lokale Netzwerk.'
  $environment = @("PORT=$Port", "RTC_PORT=$RtcPort", "DATA_DIR=$DataDir")
  if ($Ip) { $environment += "IP=$Ip" }
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" -Name Environment -Type MultiString -Value $environment
  Invoke-Checked sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/5000/restart/30000 | Out-Null

  Get-NetFirewallRule -Group $FirewallGroup -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  New-NetFirewallRule -DisplayName 'ECG Stream (Web)' -Group $FirewallGroup -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Action Allow | Out-Null
  New-NetFirewallRule -DisplayName 'ECG Stream (Audio UDP)' -Group $FirewallGroup -Direction Inbound -Protocol UDP -LocalPort $RtcPort -RemoteAddress LocalSubnet -Action Allow | Out-Null
  New-NetFirewallRule -DisplayName 'ECG Stream (Audio TCP)' -Group $FirewallGroup -Direction Inbound -Protocol TCP -LocalPort $RtcPort -RemoteAddress LocalSubnet -Action Allow | Out-Null

  Step 'Server wird gestartet'
  Start-Service $ServiceName
  $url = "http://127.0.0.1:$Port/"
  $ok = $false
  for ($i = 0; $i -lt 40 -and -not $ok; $i++) {
    try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; $ok = $true } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ok) {
    Get-Content (Join-Path $DataDir 'server.log') -Tail 20 -ErrorAction SilentlyContinue
    throw "Der Server antwortet nicht. Protokoll: $DataDir\server.log"
  }
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

$address = if ($Ip) { $Ip } else {
  (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.PrefixOrigin -in 'Dhcp', 'Manual' -and $_.InterfaceAlias -notmatch 'vEthernet|Virtual|VMware|VirtualBox|WSL' } | Select-Object -First 1).IPAddress
}
$suffix = if ($Port -eq 80) { '' } else { ":$Port" }
Write-Host "`nFertig! Der Stream läuft und startet ab jetzt automatisch mit dem Computer." -ForegroundColor Green
Write-Host "  Zuhörer (Handy im selben WLAN):  http://$address$suffix"
Write-Host "  Verwaltung (an diesem Computer): http://localhost$suffix/publish.html"
Write-Host "  Aktualisieren: Doppelklick auf $AppDir\installer\update-windows.cmd"
