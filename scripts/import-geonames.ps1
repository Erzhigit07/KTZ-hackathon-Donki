param(
  [string]$Archive = (Join-Path $PSScriptRoot '..\data\geonames-KZ.zip'),
  [string]$Output = (Join-Path $PSScriptRoot '..\data\stations-kz.json')
)

Add-Type -AssemblyName System.IO.Compression
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Archive))
try {
  $entry = $zip.GetEntry('KZ.txt')
  if (-not $entry) { throw 'KZ.txt is missing from the GeoNames archive.' }
  $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8)
  try {
    $stations = [System.Collections.Generic.List[object]]::new()
    $counts = @{ RSTN = 0; RSTP = 0; RSD = 0 }
    while (($line = $reader.ReadLine()) -ne $null) {
      $fields = $line.Split([char]9)
      if ($fields.Length -lt 19 -or -not $counts.ContainsKey($fields[7])) { continue }
      $lat = 0.0; $lon = 0.0
      if (-not [double]::TryParse($fields[4], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lat)) { continue }
      if (-not [double]::TryParse($fields[5], [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lon)) { continue }
      if ([Math]::Abs($lat) -gt 90 -or [Math]::Abs($lon) -gt 180) { continue }
      $aliases = @($fields[3].Split(',') | Where-Object { $_ -and $_ -ne $fields[1] } | Select-Object -Unique)
      $cyrillic = @($aliases | Where-Object { $_ -match '^\p{IsCyrillic}' -and $_ -notmatch '^(Станция|Стансасы|Разъезд|Остановочный пункт)\s' })
      $name = if ($cyrillic.Count) { $cyrillic[0] } else { $fields[1] }
      $stations.Add([ordered]@{
        id = "geonames:$($fields[0])"
        name = $name
        originalName = $fields[1]
        aliases = $aliases
        lat = $lat
        lon = $lon
        type = $fields[7]
      })
      $counts[$fields[7]]++
    }
    $result = [ordered]@{
      source = 'GeoNames'
      sourceUrl = 'https://download.geonames.org/export/dump/KZ.zip'
      license = 'CC BY 4.0'
      licenseUrl = 'https://creativecommons.org/licenses/by/4.0/'
      importedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
      counts = $counts
      stations = $stations
    }
    $json = ConvertTo-Json -InputObject $result -Depth 8 -Compress
    [System.IO.File]::WriteAllText($Output, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Output "Imported $($stations.Count) railway places to $Output"
  } finally { $reader.Dispose() }
} finally { $zip.Dispose() }
