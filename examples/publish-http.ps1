# File: /examples/publish-http.ps1 | Version: 0.2.0
#Requires -Version 7.0
param(
    [Parameter(Mandatory)][string]$PlanFile,
    [Parameter(Mandatory)][string]$TokenFile,
    [string]$BaseUrl = 'http://127.0.0.1:3210'
)
$ErrorActionPreference = 'Stop'
$stage = 'Configuration'
try {
    $origin = [Uri]$BaseUrl
    $local = $origin.Host -in @('localhost', '127.0.0.1', '[::1]', '::1')
    if ($origin.Scheme -notin @('http', 'https') -or $origin.UserInfo -or $origin.Query -or $origin.Fragment -or $origin.AbsolutePath -ne '/' -or
        (-not $local -and $origin.GetLeftPart([UriPartial]::Authority) -ne 'https://updatehub.ygsoft.fr')) {
        throw 'Use a loopback HTTP(S) origin or https://updatehub.ygsoft.fr, without paths or credentials'
    }
    $token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
    if ($token -cnotmatch '^[a-f0-9]{64}$') { throw 'Invalid token file' }
    $headers = @{ Authorization = "Bearer $token" }
    function Invoke-HubJson {
        param([string]$Path, [string]$Method, [object]$Body, [hashtable]$ExtraHeaders = @{})
        $requestHeaders = $headers.Clone()
        foreach ($key in $ExtraHeaders.Keys) { $requestHeaders[$key] = $ExtraHeaders[$key] }
        $parameters = @{
            Uri = $origin.GetLeftPart([UriPartial]::Authority) + '/api/v1' + $Path
            Method = $Method
            Headers = $requestHeaders
            MaximumRedirection = 0
            TimeoutSec = 90
        }
        if ($null -ne $Body) { $parameters.Body = ConvertTo-Json -InputObject $Body -Depth 20 -Compress; $parameters.ContentType = 'application/json' }
        elseif ($Method -eq 'POST') { $parameters.Body = '{}'; $parameters.ContentType = 'application/json' }
        return Invoke-RestMethod @parameters
    }
    $planPath = (Resolve-Path -LiteralPath $PlanFile).Path
    $limits = Invoke-HubJson -Path '/publishing/limits' -Method GET
    $plan = Get-Content -LiteralPath $planPath -Raw | ConvertFrom-Json
    $draft = [ordered]@{
        product = $plan.product
        version = $plan.version
        channel = $plan.channel
        release_notes = [string]($plan.release_notes ?? '')
        targets = @($plan.targets)
    }
    $inventory = @($plan.files | ForEach-Object {
        $path = [IO.Path]::GetFullPath([IO.Path]::Combine([IO.Path]::GetDirectoryName($planPath), $_))
        $file = Get-Item -LiteralPath $path
        if ($file.PSIsContainer -or $file.Length -lt 1 -or ($null -ne $limits.upload_max_bytes -and $file.Length -gt $limits.upload_max_bytes)) { throw 'Invalid artifact size' }
        [PSCustomObject]@{ path = $path; filename = $file.Name; size = $file.Length; sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
    if ($inventory.Count -lt 1 -or $inventory.Count -gt 32 -or @($inventory.filename | Sort-Object -Unique).Count -ne $inventory.Count) { throw 'Invalid artifact inventory' }
    $identity = ConvertTo-Json -InputObject @($draft.product, $draft.channel, $draft.version) -Compress
    $hashAlgorithm = [Security.Cryptography.SHA256]::Create()
    try { $keyHash = [BitConverter]::ToString($hashAlgorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($identity))).Replace('-', '').ToLowerInvariant() }
    finally { $hashAlgorithm.Dispose() }
    $stage = 'Draft creation'
    $release = Invoke-HubJson -Path '/publishing/releases' -Method POST -Body $draft -ExtraHeaders @{ 'Idempotency-Key' = "publish-$keyHash" }
    if ($release.status -eq 'withdrawn') { throw 'Withdrawn release cannot be published' }
    if ($release.status -eq 'draft') {
        $stage = 'Artifact upload'
        foreach ($file in $inventory) {
            $release = Invoke-RestMethod -Method POST -Uri ($origin.GetLeftPart([UriPartial]::Authority) + "/api/v1/publishing/releases/$($release.id)/artifacts") `
                -Headers $headers -Form @{ file = Get-Item -LiteralPath $file.path } -MaximumRedirection 0 -TimeoutSec ($limits.upload_timeout_seconds + 30)
        }
    }
    $stage = 'Inventory verification'
    if (@($release.artifacts).Count -ne $inventory.Count) { throw 'Stored inventory differs' }
    $order = @($inventory | ForEach-Object {
        $file = $_
        $matchedArtifacts = @($release.artifacts | Where-Object { $_.filename -ceq $file.filename -and $_.size -eq $file.size -and $_.sha256 -ceq $file.sha256 })
        if ($matchedArtifacts.Count -ne 1) { throw 'Stored inventory differs' }
        $matchedArtifacts[0].id
    })
    if ($release.status -eq 'published') {
        if ((ConvertTo-Json -InputObject @($release.manifest.artifact_order) -Compress) -cne (ConvertTo-Json -InputObject $order -Compress)) { throw 'Published order differs' }
    } else {
        $stage = 'Manifest validation'
        $null = Invoke-HubJson -Path "/publishing/releases/$($release.id)/manifest" -Method PUT -Body @{ schema_version = '1'; artifact_order = $order }
        $validation = Invoke-HubJson -Path "/publishing/releases/$($release.id)/validate" -Method POST
        if (-not $validation.valid) { throw 'Release validation failed' }
        $stage = 'Publication'
        $release = Invoke-HubJson -Path "/publishing/releases/$($release.id)/publish" -Method POST
    }
    Write-Output "Published $($release.product) $($release.version) ($($release.id)), $(@($release.artifacts).Count) artifacts. Safe to retry the same plan."
    exit 0
} catch {
    $status = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    [Console]::Error.WriteLine("$stage failed (HTTP $status; 0 means a local or transport error). Check the plan, scoped credential, local files and API availability. No secrets are printed.")
    exit 1
}