# Makes https://saams.fun/ open the game (index.html) before WordPress (index.php).
# Downloads the site's .htaccess, keeps a backup copy in backups\, adds one line at the top, uploads it back.
# Nothing is deleted. The FTP password is asked in a Windows dialog and never saved.
param( [string] $Remote = 'domains/saams.fun/public_html' )
# text piped to curl must not start with a byte-order mark (curl then rejects the password line)
$OutputEncoding = New-Object Text.UTF8Encoding $false
$HostIp   = '82.25.125.145'
$UserName = 'u220100750'
$Line     = 'DirectoryIndex index.html index.php'

$cred = Get-Credential -UserName $UserName -Message 'Hostinger FTP password (to make the game the home page)'
if ( -not $cred ) { Write-Host 'Cancelled.'; exit 1 }
$pw  = $cred.GetNetworkCredential().Password -replace '\\', '\\' -replace '"', '\"'
$cfg = 'user = "' + $UserName + ':' + $pw + '"'
$Remote = $Remote.Trim( '/' )
$url = "ftp://$HostIp/$Remote/.htaccess"

$backups = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force $backups | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$copy  = Join-Path $backups "saams-htaccess-$stamp.txt"

for ( $try = 1; $try -le 5; $try++ ) {
	$cfg | curl.exe -s -S -K - --ssl-reqd -k --tls-max 1.2 -o $copy $url
	if ( $LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 78 ) { break }
	if ( $LASTEXITCODE -eq 67 ) { Write-Host 'Wrong FTP password (530). Run it again.'; exit 1 }
	Start-Sleep -Seconds 2
}
if ( $LASTEXITCODE -eq 78 ) {
	Write-Host 'No .htaccess on the site yet: a new one with just the line will be uploaded.'
	$old = ''
} elseif ( $LASTEXITCODE -ne 0 ) {
	Write-Host "Download failed (curl $LASTEXITCODE). Nothing was changed."; exit 1
} else {
	$old = [IO.File]::ReadAllText( $copy )
	Write-Host "Backup of the current .htaccess: $copy"
}

if ( $old -match '(?im)^\s*DirectoryIndex\s+index\.html' ) { Write-Host 'Already set. Nothing to do.'; exit 0 }

$new  = "# Sams Gama: open the game first, WordPress stays installed`r`n$Line`r`n`r`n" + $old
$file = Join-Path $env:TEMP "saams-htaccess-new-$stamp"
[IO.File]::WriteAllText( $file, $new, ( New-Object Text.UTF8Encoding $false ) )

for ( $try = 1; $try -le 5; $try++ ) {
	$cfg | curl.exe -s -S -K - --ssl-reqd -k --tls-max 1.2 -T $file $url
	if ( $LASTEXITCODE -eq 0 ) { break }
	Start-Sleep -Seconds 2
}
Remove-Item $file -ErrorAction SilentlyContinue
if ( $LASTEXITCODE -ne 0 ) { Write-Host "Upload failed (curl $LASTEXITCODE). The site is unchanged."; exit 1 }
Write-Host 'Done: saams.fun now opens the game.'
