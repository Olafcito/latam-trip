# Opens the planner in the browser and starts the dev server first if it is not running.
# The Desktop shortcut runs this file. The port is fixed so it never finds another Vite app.
$port = 5198
$url = "http://localhost:$port"
$planner = Split-Path -Parent $PSScriptRoot

function Test-Planner {
  try { (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
}

if (-not (Test-Planner)) {
  Start-Process node -ArgumentList 'node_modules/vite/bin/vite.js', '--port', $port, '--strictPort' `
    -WorkingDirectory $planner -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Planner)) {
    if ((Get-Date) -gt $deadline) {
      # the shortcut runs hidden, so a failure has to be shown in a dialog
      Add-Type -AssemblyName PresentationFramework
      [System.Windows.MessageBox]::Show("The planner did not start on port $port. Run npm run dev in planner to see why.", 'Latam Trip') | Out-Null
      exit 1
    }
    Start-Sleep -Milliseconds 300
  }
}

Start-Process $url
