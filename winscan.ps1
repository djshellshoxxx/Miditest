# MIDItest Windows MIDI/USB scan. READ-ONLY: reads event logs, Device Manager state, services, power setting and
# setupapi/WER logs, then prints one JSON object. Nothing is changed. Set $env:MIDITEST_DAYS to change the 7-day window.
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$days = 7; if ($env:MIDITEST_DAYS -match '^\d+$') { $days = [int]$env:MIDITEST_DAYS }
$since = (Get-Date).AddDays(-$days)
$errs = New-Object System.Collections.ArrayList
$kw = 'midi|usb|audio|vid_|wdmaud|usbaudio|midisrv|winmm|ksuser|mmdevapi|endpoint|plug and play|wudf|umdf'
$prov = 'PnP|UserPnp|USB|usbhub|Audio|Wudf|DriverFrameworks|Service Control Manager|Kernel-Power|WHEA|SystemErrorReporting|Application Error|Application Hang|Windows Error Reporting'
function Get-Ev($log, $max) {
  try { Get-WinEvent -FilterHashtable @{ LogName = $log; StartTime = $since; Level = 1, 2, 3 } -MaxEvents $max -ErrorAction Stop } catch { [void]$errs.Add("${log}: $($_.Exception.Message)") }
}
$events = @()
foreach ($l in 'System', 'Application', 'Microsoft-Windows-Kernel-PnP/Configuration', 'Microsoft-Windows-DriverFrameworks-UserMode/Operational') {
  foreach ($e in (Get-Ev $l 2500)) {
    $m = [string]$e.Message
    if (($e.ProviderName -match $prov) -and ($m -match $kw -or $e.ProviderName -match 'Kernel-Power|WHEA|SystemErrorReporting|USB|usbhub|DriverFrameworks')) {
      if ($m.Length -gt 700) { $m = $m.Substring(0, 700) }
      $events += [pscustomobject]@{ time = $e.TimeCreated.ToString('o'); log = $l; provider = $e.ProviderName; id = $e.Id; level = $e.Level; message = $m }
    }
  }
}
$devices = @(); $drivers = @()
$pnp = Get-CimInstance Win32_PnPEntity
foreach ($d in $pnp) {
  $isRel = ($d.Name -match 'midi|usb audio|usb-midi|usb composite') -or ($d.PNPClass -in 'MEDIA', 'USB', 'AudioEndpoint', 'SoftwareDevice')
  if ($isRel -and ($d.ConfigManagerErrorCode -ne 0 -or $d.Name -match 'midi|usb audio')) {
    $devices += [pscustomobject]@{ name = $d.Name; id = $d.PNPDeviceID; class = $d.PNPClass; status = $d.Status; errorCode = [int]$d.ConfigManagerErrorCode; manufacturer = $d.Manufacturer; service = $d.Service }
  }
}
$ids = @($devices | ForEach-Object { $_.id })
foreach ($s in (Get-CimInstance Win32_PnPSignedDriver)) {
  if ($ids -contains $s.DeviceID) {
    $drivers += [pscustomobject]@{ deviceId = $s.DeviceID; name = $s.DeviceName; version = $s.DriverVersion; date = if ($s.DriverDate) { $s.DriverDate.ToString('yyyy-MM-dd') } else { $null }; provider = $s.DriverProviderName; signed = $s.IsSigned; inf = $s.InfName }
  }
}
$services = @(Get-Service Audiosrv, AudioEndpointBuilder, PlugPlay, MidiSrv | ForEach-Object { [pscustomobject]@{ name = $_.Name; displayName = $_.DisplayName; status = [string]$_.Status; startType = [string]$_.StartType } })
$sus = $null
try {
  $q = powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 | Out-String
  $sus = [pscustomobject]@{ ac = ([regex]::Match($q, 'Current AC Power Setting Index:\s*(0x[0-9a-fA-F]+)').Groups[1].Value); dc = ([regex]::Match($q, 'Current DC Power Setting Index:\s*(0x[0-9a-fA-F]+)').Groups[1].Value) }
} catch { [void]$errs.Add("powercfg: $($_.Exception.Message)") }
$setup = @()
try {
  $lines = Get-Content "$env:WINDIR\INF\setupapi.dev.log" -Tail 12000 -ErrorAction Stop
  $cur = $null
  foreach ($ln in $lines) {
    if ($ln -match '^>>>\s+\[(.+?)\]\s*$') { $cur = [pscustomobject]@{ title = $Matches[1]; time = $null; exit = $null; warnings = @() } }
    elseif ($cur -and $ln -match '^>>>\s+Section start\s+(.+)$') { $cur.time = $Matches[1] }
    elseif ($cur -and $ln -match '^(!!!|!\s{2,})\s*(.+)$') { if ($cur.warnings.Count -lt 8) { $cur.warnings += $Matches[2].Trim() } }
    elseif ($cur -and $ln -match '^<<<\s+\[Exit status:\s*(.+?)\]\s*$') {
      $cur.exit = $Matches[1]
      if ($cur.title -match 'midi|usb|usbaudio|media|audio') { $setup += $cur }
      $cur = $null
    }
  }
  $setup = @($setup | Select-Object -Last 40)
} catch { [void]$errs.Add("setupapi.dev.log: $($_.Exception.Message)") }
$wer = @()
foreach ($root in "$env:ProgramData\Microsoft\Windows\WER\ReportArchive", "$env:LOCALAPPDATA\Microsoft\Windows\WER\ReportArchive") {
  foreach ($dir in (Get-ChildItem $root -Directory | Where-Object { $_.LastWriteTime -gt $since } | Sort-Object LastWriteTime -Descending | Select-Object -First 40)) {
    $f = Join-Path $dir.FullName 'Report.wer'
    if (Test-Path $f) {
      $t = (Get-Content $f -Raw)
      $mod = [regex]::Match($t, 'Sig\[\d\]\.Name=Fault Module Name\s*\r?\nSig\[\d\]\.Value=(.+)').Groups[1].Value.Trim()
      if ($mod -match 'winmm|wdmaud|midimap|usbaudio|ksuser|mmdevapi|ksproxy|midisrv|ksthunk') {
        $wer += [pscustomobject]@{ time = $dir.LastWriteTime.ToString('o'); app = [regex]::Match($t, '(?m)^AppName=(.*)$').Groups[1].Value.Trim(); eventName = [regex]::Match($t, '(?m)^EventName=(.*)$').Groups[1].Value.Trim(); module = $mod; exception = [regex]::Match($t, 'Sig\[\d\]\.Name=Exception Code\s*\r?\nSig\[\d\]\.Value=(.+)').Groups[1].Value.Trim() }
      }
    }
  }
}
$dumps = @(Get-ChildItem "$env:WINDIR\Minidump" -Filter *.dmp | Where-Object { $_.LastWriteTime -gt $since } | ForEach-Object { $_.Name + ' ' + $_.LastWriteTime.ToString('o') })
[pscustomobject]@{
  generated = (Get-Date).ToString('o'); days = $days
  os = (Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption) + ' ' + (Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Version)
  events = @($events | Sort-Object time -Descending | Select-Object -First 300); devices = $devices; drivers = $drivers; services = $services
  usbSelectiveSuspend = $sus; setupapi = $setup; wer = $wer; minidumps = $dumps; errors = @($errs)
} | ConvertTo-Json -Depth 6 -Compress
