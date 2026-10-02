param(
    [Parameter(Mandatory=$true)][string]$ManifestPath,
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [string]$Voice = 'Microsoft Zira Desktop'
)
$ErrorActionPreference = 'Stop'
# The user authorized a free local voice. This uses installed Windows speech only.
# No provider credentials, network, purchase, installation or voice cloning.
Add-Type -AssemblyName System.Speech
$taskManifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$taskOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($taskOutput) | Out-Null
$taskSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $taskInstalled = @($taskSynth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name })
    if ($taskInstalled -notcontains $Voice) { throw "Required local voice not installed: $Voice" }
    $taskSynth.SelectVoice($Voice)
    $taskSynth.Rate = 0
    $taskSynth.Volume = 100
    $taskFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
        22050,
        [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
        [System.Speech.AudioFormat.AudioChannel]::Mono
    )
    foreach ($taskItem in $taskManifest) {
        $taskTarget = [System.IO.Path]::Combine($taskOutput, [string]$taskItem.file)
        if ([System.IO.Path]::GetDirectoryName($taskTarget) -ne $taskOutput) { throw 'Unexpected narration path.' }
        $taskSynth.SetOutputToWaveFile($taskTarget, $taskFormat)
        $taskSynth.Speak([string]$taskItem.text)
        $taskSynth.SetOutputToNull()
    }
    Write-Output "Prepared $($taskManifest.Count) local speech clips using $Voice."
} finally { $taskSynth.Dispose() }
