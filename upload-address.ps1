# Uploads site\server.json (the live village's address) to https://saams.fun/server.json.
# The FTP password is asked in a Windows dialog and never saved. (The password goes to curl as an argument,
# not through a pipe, so it works in any PowerShell window.)
$cred = Get-Credential -UserName 'u220100750' -Message 'Hostinger FTP password (to point saams.fun at the live village)'
if ( -not $cred ) { Write-Host 'Cancelled.'; exit 1 }
$login = 'u220100750:' + $cred.GetNetworkCredential().Password
$json = Join-Path $PSScriptRoot 'site\server.json'
for ( $try = 1; $try -le 5; $try++ ) {
	& curl.exe -s -S --ssl-reqd -k --tls-max 1.2 -u $login -T $json 'ftp://82.25.125.145/domains/saams.fun/public_html/server.json'
	if ( $LASTEXITCODE -eq 0 ) { Write-Host 'saams.fun now points to the live village.'; exit 0 }
	if ( $LASTEXITCODE -eq 67 ) { Write-Host 'Wrong FTP password (530).'; exit 1 }
	Start-Sleep -Seconds 2
}
Write-Host "Upload failed (curl $LASTEXITCODE)."; exit 1
