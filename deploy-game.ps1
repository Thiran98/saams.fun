# Uploads the Sams Gama game files (the client folder) to the Hostinger hosting over FTP.
# Usage examples:
#   .\deploy-game.ps1 -Remote 'domains/ieltsgym.app/public_html/sams-gama'
#   .\deploy-game.ps1 -Remote 'domains/ieltsgym.app/public_html/sams'      (folder of a subdomain made in hPanel)
# The FTP password is asked in a Windows dialog; it is never written to disk or shown.
# Only the browser game is uploaded. The multiplayer server (server folder) cannot run on this hosting (see docs).
param( [Parameter( Mandatory = $true )] [string] $Remote )
$HostIp   = '82.25.125.145'
$UserName = 'u220100750'
$Local    = Join-Path $PSScriptRoot 'client'

$cred = Get-Credential -UserName $UserName -Message 'Hostinger FTP password (to upload Sams Gama)'
if ( -not $cred ) { Write-Host 'Cancelled.'; exit 1 }
$pw  = $cred.GetNetworkCredential().Password -replace '\\', '\\' -replace '"', '\"'
$cfg = 'user = "' + $UserName + ':' + $pw + '"'
$Remote = $Remote.Trim( '/' )

$failed = 0
$files = Get-ChildItem $Local -Recurse -File | Where-Object { $_.Name -ne 'README.md' }
foreach ( $f in $files ) {
	$rel = $f.FullName.Substring( $Local.Length + 1 ) -replace '\\', '/'
	# The encrypted data connection sometimes drops (curl 18, "426"): try each file up to 5 times.
	for ( $try = 1; $try -le 5; $try++ ) {
		$cfg | curl.exe -s -S -K - --ssl-reqd -k --tls-max 1.2 --ftp-create-dirs -T $f.FullName "ftp://$HostIp/$Remote/$rel"
		if ( $LASTEXITCODE -eq 0 ) { break }
		if ( $LASTEXITCODE -eq 67 ) { Write-Host 'Wrong FTP password (530). Run it again and type the password carefully.'; exit 1 }
		Start-Sleep -Seconds 2
	}
	if ( $LASTEXITCODE -eq 0 ) { Write-Host "Uploaded: $rel" } else { Write-Host "FAILED:   $rel"; $failed++ }
}
if ( $failed ) { Write-Host "$failed file(s) failed."; exit 1 }
Write-Host "Done: $($files.Count) files."
