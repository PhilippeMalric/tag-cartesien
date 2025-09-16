$ErrorActionPreference = "Stop"

# --------- Réglages ----------
$APP_NAME = "tag-cartesien"
# -----------------------------

function Need($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host ("Missing: {0}. Install it and retry." -f $cmd) -ForegroundColor Red
    exit 1
  }
}

Need node
Need npm
Need ng
Need firebase

# Sommes-nous déjà dans un workspace Angular ?
$inWorkspace = Test-Path "./angular.json"

if (-not $inWorkspace) {
  Write-Host ("Creating Angular project: {0}" -f $APP_NAME)
  ng new $APP_NAME --standalone --routing --style=scss --skip-git
  Set-Location $APP_NAME
} else {
  Write-Host "Angular workspace detected (angular.json present). Skipping 'ng new' and cd."
}


Write-Host "Creating utility folders"
New-Item -ItemType Directory -Force -Path "src/app/components","src/app/core/models","src/app/core/utils","src/app/game","src/app/assets/sfx" | Out-Null

# Routes placeholder (ne pas écraser si déjà présent)
$routesPath = "src/app/app.routes.ts"
if (-not (Test-Path $routesPath)) {
  $lines = @()
  $lines += "import { Routes } from '@angular/router';"
  $lines += "import { AuthComponent } from './pages/auth/auth.component';"
  $lines += "import { LobbyComponent } from './pages/lobby/lobby.component';"
  $lines += "import { RoomComponent } from './pages/room/room.component';"
  $lines += "import { PlayComponent } from './pages/play/play.component';"
  $lines += "import { ScoreComponent } from './pages/score/score.component';"
  $lines += ""
  $lines += "export const routes: Routes = ["
  $lines += "  { path: 'auth', component: AuthComponent },"
  $lines += "  { path: 'lobby', component: LobbyComponent },"
  $lines += "  { path: 'room/:roomId', component: RoomComponent },"
  $lines += "  { path: 'play/:matchId', component: PlayComponent },"
  $lines += "  { path: 'score/:matchId', component: ScoreComponent },"
  $lines += "  { path: '', pathMatch: 'full', redirectTo: 'auth' },"
  $lines += "  { path: '**', redirectTo: 'auth' },"
  $lines += "];"
  $lines | Set-Content -Path $routesPath -Encoding UTF8
  Write-Host ("Created routes file: {0}" -f $routesPath)
} else {
  Write-Host ("{0} already exists — not overwriting." -f $routesPath)
}

Write-Host ""
Write-Host "Done."
Write-Host "Next:"
Write-Host "  1) firebase login"
Write-Host "  2) firebase init   (Firestore, Realtime Database)"
Write-Host "  3) Add Firebase Web config in src/environments/environment.ts"
Write-Host "  4) ng serve --port 4300 --open"
