# Puts Sams Gama on https://saams.fun (Hostinger, over FTPS):
#   site\index.html   -> saams.fun/              (the game menu)
#   site\server.json  -> saams.fun/server.json   (the game server's current address; play-online.ps1 updates it)
#   client\*          -> saams.fun/play/         (the live game: the page connects to the game server in server.json)
#   client\*          -> saams.fun/practice/     (practise alone: the single-player game, the same files)
# The current saams.fun/index.html is downloaded to backups\ first. Nothing on the site is deleted.
# The FTP password is asked in a Windows dialog and never saved.
# -FrontOnly: upload only the front page (index.html and server.json), not the game files
# -Only src/mafia.js,css/style.css: upload only these game files (to play/ and practice/), nothing else
# -Only ... -AlsoFront: those game files and the front page (index.html, server.json) in one go
param( [string] $Remote = 'domains/saams.fun/public_html', [switch] $FrontOnly, [string[]] $Only, [switch] $AlsoFront )
$HostIp   = '82.25.125.145'
$UserName = 'u220100750'
$root     = $PSScriptRoot
$Remote   = $Remote.Trim( '/' )

$cred = Get-Credential -UserName $UserName -Message 'Hostinger FTP password (to publish Sams Gama on saams.fun)'
if ( -not $cred ) { Write-Host 'Cancelled.'; exit 1 }
# the login goes to curl as an argument (not through a pipe), so this works in any PowerShell window
$login = $UserName + ':' + $cred.GetNetworkCredential().Password

# one FTPS transfer, retried (Hostinger's data connection is sometimes flaky)
function Send( [string] $local, [string] $remotePath ) {
	for ( $try = 1; $try -le 5; $try++ ) {
		& curl.exe -s -S -u $login --ssl-reqd -k --tls-max 1.2 --ftp-create-dirs -T $local "ftp://$HostIp/$Remote/$remotePath"
		if ( $LASTEXITCODE -eq 0 ) { Write-Host "  uploaded $remotePath"; return }
		if ( $LASTEXITCODE -eq 67 ) { Write-Host 'Wrong FTP password (530). Nothing more was uploaded.'; exit 1 }
		Start-Sleep -Seconds 2
	}
	Write-Host "Upload of $remotePath failed (curl $LASTEXITCODE)."; exit 1
}

# backup of the current home page
$backups = Join-Path $root 'backups'
New-Item -ItemType Directory -Force $backups | Out-Null
$copy = Join-Path $backups ( 'saams-index-' + ( Get-Date -Format 'yyyyMMdd-HHmmss' ) + '.html' )
& curl.exe -s -S -u $login --ssl-reqd -k --tls-max 1.2 -o $copy "ftp://$HostIp/$Remote/index.html"
if ( $LASTEXITCODE -eq 67 ) { Write-Host 'Wrong FTP password (530). Nothing was changed.'; exit 1 }
if ( $LASTEXITCODE -eq 0 ) { Write-Host "Backup of the current home page: $copy" } else { Write-Host 'No current home page to back up.' }

# The game page with every script and the stylesheet stamped with this upload's version (?v=...), so browsers
# never keep using old game files after an update. The game folders also get a no-caching rule (.htaccess).
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$page = Join-Path $env:TEMP "sams-gama-index-$stamp.html"
$html = [IO.File]::ReadAllText( ( Join-Path $root 'client\index.html' ) )
$html = [regex]::Replace( $html, '(src="src/[A-Za-z]+\.js|href="css/style\.css)"', ( '$1?v=' + $stamp + '"' ) )
[IO.File]::WriteAllText( $page, $html, ( New-Object Text.UTF8Encoding $false ) )
function Send-GamePage( [string] $folder ) {
	Send $page "$folder/index.html"
	Send ( Join-Path $root 'site\game.htaccess' ) "$folder/.htaccess"
}

if ( $Only ) {
	foreach ( $folder in 'game', 'play', 'practice' ) {
		foreach ( $f in $Only ) { if ( $f -ne 'index.html' ) { Send ( Join-Path ( Join-Path $root 'client' ) ( $f -replace '/', '\' ) ) "$folder/$f" } }
		Send-GamePage $folder # always: the new version stamp makes browsers load the changed files
	}
	Remove-Item $page -ErrorAction SilentlyContinue
	if ( $AlsoFront ) {
		Write-Host 'Front page'
		Send ( Join-Path $root 'site\server.json' ) 'server.json'
		Send ( Join-Path $root 'site\index.html' ) 'index.html'
	}
	Write-Host 'Done.'; exit 0
}
if ( -not $FrontOnly ) {
	foreach ( $folder in 'game', 'play', 'practice' ) {
		Write-Host "The game -> $folder/"
		Send-GamePage $folder
		Send ( Join-Path $root 'client\css\style.css' ) "$folder/css/style.css"
		Get-ChildItem ( Join-Path $root 'client\src' ) -Filter *.js | ForEach-Object { Send $_.FullName ( "$folder/src/" + $_.Name ) }
	}
}

Remove-Item $page -ErrorAction SilentlyContinue
Write-Host 'Front page'
Send ( Join-Path $root 'site\server.json' ) 'server.json'
Send ( Join-Path $root 'site\index.html' ) 'index.html'
Write-Host ''
Write-Host 'Done: https://saams.fun is up to date. (If you still see an old page, flush the CDN cache in hPanel.)'
