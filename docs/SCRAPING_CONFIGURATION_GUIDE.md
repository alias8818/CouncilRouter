# Dynamic Model Pricing - Scraping Configuration Guide

## Overview

This guide covers configuring web scraping for AI model pricing information from provider websites. The scraping system uses configurable CSS selectors and fallback strategies to adapt to website structure changes without code modifications.

## Scraping Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Scraping Configuration                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Provider: openai                                     │  │
│  │  URL: https://openai.com/api/pricing/               │  │
│  │  Strategies: [primary, fallback1, fallback2]        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Pricing Scraper Service                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. Fetch HTML from provider URL                     │  │
│  │  2. Try primary selector strategy                    │  │
│  │  3. If fails, try fallback strategies in order       │  │
│  │  4. If all fail, use cached pricing data             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Extracted Pricing Data                      │
│  • Model names                                               │
│  • Input costs per million tokens                           │
│  • Output costs per million tokens                          │
│  • Pricing tiers (standard, batch, cached)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Configuration Format

### Database Schema

Scraping configurations are stored in the `scraping_config` table:

```sql
CREATE TABLE scraping_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Configuration Object Structure

```typescript
interface ScrapingConfig {
  url: string;                    // Provider pricing page URL
  strategies: SelectorStrategy[]; // Ordered list of selector strategies
  throttleMs: number;             // Delay between requests (default: 1000)
  timeoutMs: number;              // Request timeout (default: 30000)
  userAgent?: string;             // Custom User-Agent header
  headers?: Record<string, string>; // Additional HTTP headers
}

interface SelectorStrategy {
  name: string;                   // Strategy identifier
  selectors: {
    table: string;                // CSS selector for pricing table
    rows: string;                 // CSS selector for table rows
    modelName: string | number;   // Column index or selector for model name
    inputCost: string | number;   // Column index or selector for input cost
    outputCost: string | number;  // Column index or selector for output cost
    tier?: string | number;       // Optional: column for pricing tier
  };
  validation?: {
    minRows: number;              // Minimum expected rows
    requiredFields: string[];     // Required fields in each row
  };
}
```

---

## Provider Configurations

### OpenAI Configuration

```json
{
  "provider": "openai",
  "config": {
    "url": "https://openai.com/api/pricing/",
    "throttleMs": 1000,
    "timeoutMs": 30000,
    "strategies": [
      {
        "name": "primary",
        "selectors": {
          "table": "table.pricing-table",
          "rows": "tbody tr",
          "modelName": 0,
          "inputCost": 1,
          "outputCost": 2,
          "tier": 3
        },
        "validation": {
          "minRows": 5,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      },
      {
        "name": "fallback-div-based",
        "selectors": {
          "table": "div.pricing-grid",
          "rows": "div.pricing-row",
          "modelName": "span.model-name",
          "inputCost": "span.input-price",
          "outputCost": "span.output-price",
          "tier": "span.tier-name"
        },
        "validation": {
          "minRows": 5,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      },
      {
        "name": "fallback-legacy",
        "selectors": {
          "table": "#pricing-table",
          "rows": "tr.model-row",
          "modelName": "td:nth-child(1)",
          "inputCost": "td:nth-child(2)",
          "outputCost": "td:nth-child(3)"
        },
        "validation": {
          "minRows": 3,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      }
    ]
  }
}
```

**Key Points:**
- Primary strategy uses table-based layout
- Fallback strategies handle div-based and legacy layouts
- Validation ensures minimum data quality
- Tier information is optional

### Anthropic Configuration

```json
{
  "provider": "anthropic",
  "config": {
    "url": "https://www.anthropic.com/pricing",
    "throttleMs": 1000,
    "timeoutMs": 30000,
    "strategies": [
      {
        "name": "primary",
        "selectors": {
          "table": "table[data-testid='pricing-table']",
          "rows": "tbody tr",
          "modelName": "td:nth-child(1) strong",
          "inputCost": "td:nth-child(2)",
          "outputCost": "td:nth-child(3)",
          "tier": "td:nth-child(4)"
        },
        "validation": {
          "minRows": 3,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      },
      {
        "name": "fallback-card-based",
        "selectors": {
          "table": "div.pricing-cards",
          "rows": "div.pricing-card",
          "modelName": "h3.model-title",
          "inputCost": "div.input-pricing span.price",
          "outputCost": "div.output-pricing span.price",
          "tier": "span.tier-badge"
        },
        "validation": {
          "minRows": 2,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      }
    ]
  }
}
```

**Key Points:**
- Uses data-testid attributes for stability
- Handles both table and card-based layouts
- Extracts model names from strong tags
- Supports prompt caching tier information

### Google Gemini Configuration

```json
{
  "provider": "google",
  "config": {
    "url": "https://ai.google.dev/gemini-api/docs/pricing",
    "throttleMs": 1000,
    "timeoutMs": 30000,
    "strategies": [
      {
        "name": "primary",
        "selectors": {
          "table": "table.devsite-table",
          "rows": "tbody tr",
          "modelName": 0,
          "inputCost": 1,
          "outputCost": 2,
          "tier": "td:nth-child(4)"
        },
        "validation": {
          "minRows": 2,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      },
      {
        "name": "fallback-markdown-table",
        "selectors": {
          "table": "table",
          "rows": "tbody tr",
          "modelName": "td:first-child",
          "inputCost": "td:nth-child(2)",
          "outputCost": "td:nth-child(3)"
        },
        "validation": {
          "minRows": 1,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      }
    ]
  }
}
```

**Key Points:**
- Google uses devsite-table class
- Handles context tier pricing (<200K vs >200K tokens)
- Fallback for generic markdown tables
- Extracts multimodal pricing separately

### xAI Configuration

```json
{
  "provider": "xai",
  "config": {
    "url": "https://docs.x.ai/docs/models",
    "throttleMs": 1000,
    "timeoutMs": 30000,
    "strategies": [
      {
        "name": "primary",
        "selectors": {
          "table": "table.model-pricing",
          "rows": "tbody tr",
          "modelName": "td:first-child code",
          "inputCost": "td:nth-child(2)",
          "outputCost": "td:nth-child(3)",
          "tier": "td:nth-child(4)"
        },
        "validation": {
          "minRows": 1,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      },
      {
        "name": "fallback-docs-table",
        "selectors": {
          "table": "table",
          "rows": "tr:not(:first-child)",
          "modelName": 0,
          "inputCost": 1,
          "outputCost": 2
        },
        "validation": {
          "minRows": 1,
          "requiredFields": ["modelName", "inputCost", "outputCost"]
        }
      }
    ]
  }
}
```

**Key Points:**
- Model names in code tags
- Handles cached input pricing
- Fallback for generic documentation tables
- Supports image generation pricing

---

## Selector Strategies

### Column Index vs CSS Selector

You can specify columns using either:

1. **Numeric Index** (0-based):
```json
{
  "modelName": 0,
  "inputCost": 1,
  "outputCost": 2
}
```

2. **CSS Selector**:
```json
{
  "modelName": "td:first-child strong",
  "inputCost": "td.input-price",
  "outputCost": "td.output-price"
}
```

### Fallback Strategy Order

Strategies are tried in order until one succeeds:

1. **Primary Strategy** - Most specific, uses latest selectors
2. **Fallback Strategies** - Handle alternative layouts
3. **Cached Data** - Used when all strategies fail

### Validation Rules

Each strategy can specify validation rules:

```json
{
  "validation": {
    "minRows": 5,              // Minimum rows to consider valid
    "requiredFields": [        // Fields that must be present
      "modelName",
      "inputCost",
      "outputCost"
    ]
  }
}
```

If validation fails, the next strategy is tried.

---

## Managing Configurations

### Via Database

```sql
-- Insert new configuration
INSERT INTO scraping_config (provider, config, active)
VALUES (
  'openai',
  '{"url": "https://openai.com/api/pricing/", "strategies": [...]}'::jsonb,
  true
);

-- Update existing configuration
UPDATE scraping_config
SET config = '{"url": "https://openai.com/api/pricing/", "strategies": [...]}'::jsonb,
    updated_at = NOW()
WHERE provider = 'openai';

-- Disable configuration
UPDATE scraping_config
SET active = false
WHERE provider = 'openai';

-- View current configuration
SELECT provider, config, active, updated_at
FROM scraping_config
WHERE provider = 'openai';
```

### Via Configuration Manager API

```typescript
import { ScrapingConfigManager } from './scraping/config-manager';

const configManager = new ScrapingConfigManager(db);

// Get configuration
const config = await configManager.getConfig('openai');

// Update configuration
await configManager.updateConfig('openai', {
  url: 'https://openai.com/api/pricing/',
  strategies: [
    {
      name: 'primary',
      selectors: {
        table: 'table.pricing-table',
        rows: 'tbody tr',
        modelName: 0,
        inputCost: 1,
        outputCost: 2
      }
    }
  ]
});

// Validate configuration
const isValid = await configManager.validateConfig('openai', config);

// Test configuration against sample HTML
const testResult = await configManager.testConfig('openai', sampleHtml);
```

### Via Admin Dashboard

1. Navigate to **Configuration** → **Scraping**
2. Select provider from dropdown
3. Edit configuration JSON
4. Click **Validate** to test selectors
5. Click **Save** to apply changes
6. Monitor **Scraping Status** for success/failure

---

## Testing Configurations

### Manual Testing

```bash
# Test scraping with current configuration
curl -X POST http://localhost:3000/api/admin/scraping/test \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai"
  }'
```

Response:
```json
{
  "success": true,
  "strategy": "primary",
  "modelsFound": 12,
  "sampleData": [
    {
      "modelName": "gpt-4-turbo",
      "inputCost": 10.00,
      "outputCost": 30.00,
      "tier": "standard"
    }
  ]
}
```

### Automated Testing

```typescript
import { PricingScraper } from './scraping/scraper';

const scraper = new PricingScraper(db, redis);

// Test all providers
const results = await Promise.all([
  scraper.testProvider('openai'),
  scraper.testProvider('anthropic'),
  scraper.testProvider('google'),
  scraper.testProvider('xai')
]);

results.forEach(result => {
  console.log(`${result.provider}: ${result.success ? 'PASS' : 'FAIL'}`);
  if (!result.success) {
    console.error(`Error: ${result.error}`);
  }
});
```

---

## Handling Website Changes

### Detecting Changes

The system automatically detects scraping failures:

1. **Validation Failure** - Extracted data doesn't meet validation rules
2. **Parse Error** - Selectors don't match any elements
3. **Data Quality Issues** - Extracted data is malformed

When detected:
- Error is logged with details
- Administrator alert is generated
- System falls back to cached pricing

### Updating Configurations

When a provider changes their website:

1. **Inspect New Structure**
   ```bash
   curl https://openai.com/api/pricing/ > pricing.html
   # Open in browser and inspect elements
   ```

2. **Identify New Selectors**
   - Use browser DevTools to find CSS selectors
   - Test selectors in browser console
   - Note any structural changes

3. **Create New Strategy**
   ```json
   {
     "name": "2024-update",
     "selectors": {
       "table": "div.new-pricing-layout",
       "rows": "div.pricing-item",
       "modelName": "h3.model-title",
       "inputCost": "span.input-price",
       "outputCost": "span.output-price"
     }
   }
   ```

4. **Add as Primary Strategy**
   - Move old primary to fallback
   - Add new strategy as primary
   - Keep old strategies for rollback

5. **Test and Deploy**
   ```bash
   # Test new configuration
   npm run test:scraping -- --provider openai
   
   # Deploy if successful
   npm run deploy:config
   ```

---

## Best Practices

### Configuration Design

1. **Multiple Strategies** - Always have 2-3 fallback strategies
2. **Specific Selectors** - Use specific selectors (classes, IDs, data attributes)
3. **Validation Rules** - Set appropriate minRows and requiredFields
4. **Version Strategies** - Name strategies with dates (e.g., "2024-01-update")
5. **Test Before Deploy** - Always test configurations before production

### Selector Selection

1. **Prefer Stable Attributes**
   - Good: `data-testid`, `id`, semantic classes
   - Avoid: Generic classes, nth-child without context

2. **Use Semantic HTML**
   - Good: `table`, `tbody`, `tr`, `td`
   - Avoid: Generic `div`, `span` without classes

3. **Handle Variations**
   - Account for optional fields (tier, context limit)
   - Handle different number formats ($10.00, 10, $10)
   - Support multiple table layouts

### Maintenance

1. **Monitor Scraping Success** - Track success rates per provider
2. **Set Up Alerts** - Alert on consecutive failures (3+)
3. **Regular Testing** - Test configurations monthly
4. **Document Changes** - Keep changelog of configuration updates
5. **Version Control** - Store configurations in version control

### Rate Limiting

1. **Respect robots.txt** - Check provider's robots.txt
2. **Throttle Requests** - Use 1-2 second delays between requests
3. **User-Agent Header** - Identify your application
4. **Cache Aggressively** - Cache pricing for 7+ days
5. **Off-Peak Scraping** - Schedule scraping during off-peak hours

---

## Troubleshooting

### Scraping Fails for All Strategies

**Symptoms:**
- All strategies return validation errors
- No pricing data extracted

**Diagnosis:**
```bash
# Check if website is accessible
curl -I https://openai.com/api/pricing/

# Download HTML for inspection
curl https://openai.com/api/pricing/ > pricing.html

# Check for blocking
grep -i "captcha\|blocked\|forbidden" pricing.html
```

**Solutions:**
1. Verify URL is correct
2. Check if website structure changed
3. Verify User-Agent header
4. Check for rate limiting/blocking
5. Update selectors if structure changed

### Partial Data Extraction

**Symptoms:**
- Some models extracted, others missing
- Validation passes but data incomplete

**Diagnosis:**
```typescript
// Enable debug logging
const scraper = new PricingScraper(db, redis, { debug: true });
const result = await scraper.scrapePricing('openai');

// Check extracted data
console.log('Rows found:', result.rawData.length);
console.log('Models extracted:', result.models.length);
```

**Solutions:**
1. Check if table has multiple sections
2. Verify row selector matches all rows
3. Check for pagination
4. Update validation rules if needed

### Incorrect Data Extraction

**Symptoms:**
- Data extracted but values are wrong
- Model names or prices malformed

**Diagnosis:**
```typescript
// Test selector on sample HTML
const cheerio = require('cheerio');
const $ = cheerio.load(html);

const rows = $(config.selectors.table).find(config.selectors.rows);
rows.each((i, row) => {
  const modelName = $(row).find('td').eq(0).text();
  const inputCost = $(row).find('td').eq(1).text();
  console.log({ modelName, inputCost });
});
```

**Solutions:**
1. Verify column indices are correct
2. Check for nested elements
3. Add text extraction logic (trim, parse)
4. Update selectors to be more specific

### Rate Limiting / Blocking

**Symptoms:**
- HTTP 429 or 403 responses
- Captcha pages returned

**Diagnosis:**
```bash
# Check response headers
curl -I https://openai.com/api/pricing/

# Check for rate limit headers
curl -v https://openai.com/api/pricing/ 2>&1 | grep -i "rate\|retry"
```

**Solutions:**
1. Increase throttle delay (2-5 seconds)
2. Update User-Agent header
3. Reduce scraping frequency
4. Use cached data more aggressively
5. Contact provider about API access

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Scraping Success Rate | % of successful scrapes | < 90% |
| Models Extracted | Number of models found | < 80% of expected |
| Scraping Duration | Time to complete scrape | > 60 seconds |
| Validation Failures | Failed validation checks | > 2 consecutive |
| Cache Hit Rate | % of requests using cache | < 50% |

### Logs to Monitor

```json
{
  "level": "info",
  "category": "scraping",
  "event": "scraping_success",
  "provider": "openai",
  "strategy": "primary",
  "modelsFound": 12,
  "duration": 2340
}
```

```json
{
  "level": "error",
  "category": "scraping",
  "event": "scraping_failed",
  "provider": "openai",
  "strategy": "primary",
  "error": "Validation failed: minRows not met",
  "rowsFound": 2,
  "minRows": 5
}
```

### Alerts

Set up alerts for:
- 3+ consecutive scraping failures
- Validation failures for all strategies
- Significant drop in models extracted (>20%)
- Scraping duration > 60 seconds
- HTTP errors (403, 429, 500)

---

## Security Considerations

1. **User-Agent Header** - Always include identifying User-Agent
2. **Rate Limiting** - Respect provider rate limits
3. **robots.txt** - Check and respect robots.txt
4. **Terms of Service** - Ensure scraping complies with ToS
5. **Data Privacy** - Don't scrape personal or sensitive data
6. **Error Handling** - Handle blocking gracefully
7. **Logging** - Don't log full HTML responses
8. **Caching** - Cache aggressively to reduce requests

---

## Support

For scraping configuration assistance:
- Documentation: https://docs.example.com/scraping
- Support: support@example.com
- Configuration Examples: https://github.com/your-org/scraping-configs
