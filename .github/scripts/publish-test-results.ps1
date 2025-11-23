# PowerShell script to publish test results from JUnit XML to GitHub
# This replaces the container-based action which doesn't work on Windows runners

param(
    [string]$JUnitXmlPath = "junit.xml",
    [string]$CheckName = "Test Results",
    [string]$GitHubToken = $env:GITHUB_TOKEN,
    [string]$Repository = $env:GITHUB_REPOSITORY,
    [string]$Sha = $env:GITHUB_SHA,
    [string]$Ref = $env:GITHUB_REF
)

if (-not $GitHubToken) {
    Write-Host "Warning: GITHUB_TOKEN not set. Skipping test result publication."
    exit 0
}

if (-not (Test-Path $JUnitXmlPath)) {
    Write-Host "Warning: JUnit XML file not found at $JUnitXmlPath. Skipping test result publication."
    exit 0
}

# Parse JUnit XML
try {
    [xml]$xml = Get-Content $JUnitXmlPath
    
    $totalTests = 0
    $passedTests = 0
    $failedTests = 0
    $skippedTests = 0
    $testSuites = @()
    
    # Parse test suites (handle both testsuites wrapper and single testsuite)
    # Check root element name to avoid double-counting when testsuites wrapper exists
    # PowerShell's $xml.testsuite searches entire document, so we need to check root element first
    $rootElementName = $xml.DocumentElement.Name
    
    if ($rootElementName -eq 'testsuites' -and $xml.testsuites.testsuite) {
        # Process all testsuites within the wrapper
        foreach ($testsuite in $xml.testsuites.testsuite) {
            $suiteTotal = [int]$testsuite.tests
            $suiteFailures = [int]$testsuite.failures
            $suiteErrors = [int]$testsuite.errors
            $suiteSkipped = [int]$testsuite.skipped
            $suitePassed = $suiteTotal - $suiteFailures - $suiteErrors - $suiteSkipped
            
            $totalTests += $suiteTotal
            $passedTests += $suitePassed
            $failedTests += ($suiteFailures + $suiteErrors)
            $skippedTests += $suiteSkipped
            
            $testSuites += @{
                name = $testsuite.name
                tests = $suiteTotal
                failures = $suiteFailures
                errors = $suiteErrors
                skipped = $suiteSkipped
                time = [double]$testsuite.time
            }
        }
    }
    elseif ($rootElementName -eq 'testsuite') {
        # Process single testsuite at root level (no wrapper)
        $testsuite = $xml.testsuite
        $suiteTotal = [int]$testsuite.tests
        $suiteFailures = [int]$testsuite.failures
        $suiteErrors = [int]$testsuite.errors
        $suiteSkipped = [int]$testsuite.skipped
        $suitePassed = $suiteTotal - $suiteFailures - $suiteErrors - $suiteSkipped
        
        $totalTests += $suiteTotal
        $passedTests += $suitePassed
        $failedTests += ($suiteFailures + $suiteErrors)
        $skippedTests += $suiteSkipped
        
        $testSuites += @{
            name = $testsuite.name
            tests = $suiteTotal
            failures = $suiteFailures
            errors = $suiteErrors
            skipped = $suiteSkipped
            time = [double]$testsuite.time
        }
    }
    else {
        Write-Host "Warning: Unexpected XML structure. Root element is: $rootElementName"
    }
    
    # Determine conclusion
    $conclusion = if ($failedTests -gt 0) { "failure" } else { "success" }
    
    # Build summary
    $summary = "## Test Results`n`n"
    $summary += "- **Total Tests:** $totalTests`n"
    $summary += "- **Passed:** $passedTests`n"
    $summary += "- **Failed:** $failedTests`n"
    if ($skippedTests -gt 0) {
        $summary += "- **Skipped:** $skippedTests`n"
    }
    
    if ($testSuites.Count -gt 0) {
        $summary += "`n### Test Suites`n`n"
        foreach ($suite in $testSuites) {
            $status = if ($suite.failures -gt 0 -or $suite.errors -gt 0) { "❌" } else { "✅" }
            $summary += "$status **$($suite.name)**: $($suite.tests) tests"
            if ($suite.failures -gt 0) { $summary += ", $($suite.failures) failures" }
            if ($suite.errors -gt 0) { $summary += ", $($suite.errors) errors" }
            if ($suite.skipped -gt 0) { $summary += ", $($suite.skipped) skipped" }
            $summary += " ($([math]::Round($suite.time, 2))s)`n"
        }
    }
    
    # Build annotations for failed tests (if needed in future)
    # Note: Annotations are commented out as they require file paths which may not be available
    # $annotations = @()
    # if ($xml.testsuites -and $xml.testsuites.testsuite) {
    #     foreach ($testsuite in $xml.testsuites.testsuite) {
    #         if ($testsuite.testcase) {
    #             foreach ($testcase in $testsuite.testcase) {
    #                 if ($testcase.failure -or $testcase.error) {
    #                     $message = if ($testcase.failure) { $testcase.failure.message } else { $testcase.error.message }
    #                     $annotations += @{
    #                         path = $testsuite.name
    #                         start_line = 1
    #                         end_line = 1
    #                         annotation_level = "failure"
    #                         message = "$($testcase.name): $message"
    #                         title = $testcase.name
    #                     }
    #                 }
    #             }
    #         }
    #     }
    # }
    
    # Create check run via GitHub API
    $headers = @{
        "Authorization" = "Bearer $GitHubToken"
        "Accept" = "application/vnd.github.v3+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    
    $body = @{
        name = $CheckName
        head_sha = $Sha
        status = "completed"
        conclusion = $conclusion
        output = @{
            title = "Test Results: $passedTests/$totalTests passed"
            summary = $summary
        }
    } | ConvertTo-Json -Depth 10
    
    $apiUrl = "https://api.github.com/repos/$Repository/check-runs"
    
    Write-Host "Creating check run for commit $Sha..."
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body -ContentType "application/json"
    
    Write-Host "Check run created: $($response.html_url)"
    Write-Host "Test Results: $passedTests/$totalTests passed, $failedTests failed"
    
    if ($failedTests -gt 0) {
        exit 1
    }
    
} catch {
    Write-Host "Error publishing test results: $_"
    Write-Host "Stack trace: $($_.ScriptStackTrace)"
    # Don't fail the workflow if publishing fails
    exit 0
}

