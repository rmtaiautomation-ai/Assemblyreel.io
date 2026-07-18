$content = Get-Content "src/app/page.tsx" -Raw
$lines = $content -split "`r`n"
if ($lines.Length -eq 1) {
    $lines = $content -split "`n"
}
$newlines = $lines[0..39] + $lines[489..($lines.Length-1)]
$newcontent = $newlines -join "`n"
Set-Content "src/app/pricing/page.tsx" -Value $newcontent -Encoding UTF8
