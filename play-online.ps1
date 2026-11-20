# Starts a Sams Gama multiplayer game that friends anywhere can join, for free.
#  1. starts the game server on this computer (a second window; close it to stop the server)
#  2. opens a free Cloudflare "quick tunnel" (a link such as https://some-words.trycloudflare.com)
#  3. puts that link on https://saams.fun (server.json), so the PLAY button there joins this village
#     (asks for the Hostinger FTP password; press Cancel to skip and just send the link to friends yourself)
# The village is open only while this window and the server window stay open. The link changes every time.
# Needs Cloudflare's free cloudflared program (installed once with:  winget install Cloudflare.cloudflared).

$root = $PSScriptRoot
# text piped to curl must not start with a byte-order mark (curl then rejects the password line)
$OutputEncoding = New-Object Text.UTF8Encoding $false
$exe = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
if ( -not ( Test-Path $exe ) ) { $exe = ( Get-Command cloudflared -ErrorAction SilentlyContinue ).Source }
if ( -not $exe ) { Write-Host 'cloudflared is not installed. Run:  winget install Cloudflare.cloudflared'; exit 1 }

$running = $false
try { $running = ( Invoke-WebRequest 'http://localhost:2567/health' -UseBasicParsing -TimeoutSec 2 ).StatusCode -eq 200 } catch { }
if ( -not $running ) {
	Write-Host 'Starting the game server in a new window...'
	Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$root\server'; npm start"
	Start-Sleep -Seconds 4
}

Write-Host 'Opening the tunnel...'
$log = Join-Path $env:TEMP 'sams-gama-tunnel.log'
Remove-Item $log -ErrorAction SilentlyContinue
$tunnel = Start-Process $exe -ArgumentList 'tunnel', '--no-autoupdate', '--url', 'http://localhost:2567' -RedirectStandardError $log -NoNewWindow -PassThru

$url = $null
for ( $i = 0; $i -lt 60 -and -not $url; $i++ ) {
	Start-Sleep -Seconds 1
	if ( Test-Path $log ) {
		$m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
		if ( $m ) { $url = $m.Matches[0].Value }
	}
}
if ( -not $url ) { Write-Host "The tunnel did not start. See $log"; exit 1 }

Write-Host ''
Write-Host "Live village: $url"
Write-Host ''

# put the address on saams.fun
$json = Join-Path $root 'site\server.json'
# keep the cloud server (Render) as "url" and add this PC's tunnel as "pc": saams.fun then uses the PC while it is on
$cloud = 'https://sams-gama.onrender.com'
try { $old = Get-Content $json -Raw | ConvertFrom-Json; if ( $old.url -and $old.url -notmatch 'trycloudflare' ) { $cloud = $old.url } } catch { }
[IO.File]::WriteAllText( $json, "{ `"url`": `"$cloud`", `"pc`": `"$url`" }`n", ( New-Object Text.UTF8Encoding $false ) )
$cred = Get-Credential -UserName 'u220100750' -Message 'Hostinger FTP password (to point saams.fun at this village). Cancel = skip.'
if ( $cred ) {
	$pw  = $cred.GetNetworkCredential().Password -replace '\\', '\\' -replace '"', '\"'
	$cfg = 'user = "u220100750:' + $pw + '"'
	for ( $try = 1; $try -le 5; $try++ ) {
		$cfg | curl.exe -s -S -K - --ssl-reqd -k --tls-max 1.2 -T $json 'ftp://82.25.125.145/domains/saams.fun/public_html/server.json'
		if ( $LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 67 ) { break }
		Start-Sleep -Seconds 2
	}
	if ( $LASTEXITCODE -eq 0 ) { Write-Host 'saams.fun now points to this village: friends can go to https://saams.fun and press PLAY.' }
	elseif ( $LASTEXITCODE -eq 67 ) { Write-Host 'Wrong FTP password: saams.fun was not updated. Send the link above to your friends instead.' }
	else { Write-Host "Could not update saams.fun (curl $LASTEXITCODE). Send the link above to your friends instead." }
} else { Write-Host 'Skipped: send the link above to your friends.' }

Write-Host ''
Write-Host 'Keep this window open while you play. Press Ctrl + C (or close the window) to close the village.'
Wait-Process -Id $tunnel.Id
