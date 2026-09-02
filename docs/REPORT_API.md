# Report API

A JSON API endpoint that generates comprehensive pricing page analysis reports using AI personas. Ideal for automated test loops, batch processing, and programmatic integration.

## Endpoint

```
POST /api/report
```

## Quick Start

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-pricing-page.com",
    "personas": [
      {
        "id": "persona-1",
        "name": "Sarah Chen",
        "age": 32,
        "occupation": "Senior Software Engineer",
        "educationLevel": "M.S. Computer Science",
        "interests": ["AI/ML", "open source", "cloud infrastructure"],
        "goals": ["Evaluate ROI", "justify expense to manager"],
        "personalityTraits": ["analytical", "data-driven", "skeptical"],
        "conscientiousness": 85,
        "neuroticism": 25,
        "openness": 90,
        "extraversion": 45,
        "agreeableness": 60,
        "cognitiveReflex": 75,
        "technicalFluency": 95,
        "economicSensitivity": 70,
        "designStyle": "Minimalist",
        "livingEnvironment": "Modern apartment with home office"
      }
    ]
  }'
```

## Request

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `string` | ✅ | Target pricing page URL |
| `personas` | `Persona[]` | ✅ | Array of persona objects (1-10 recommended) |
| `requestId` | `string` | Optional | Custom request ID for tracking |
| `imageBase64` | `string` | Optional | Pre-captured screenshot (skips browser capture) |

### Persona Object

The persona drives the AI analysis with realistic behavioral parameters:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✅ | Unique identifier for this persona |
| `name` | `string` | ✅ | Display name |
| `age` | `number` | ✅ | Age |
| `occupation` | `string` | ✅ | Job title or role |
| `educationLevel` | `string` | ✅ | Highest education attained |
| `interests` | `string[]` | ✅ | Personal interests |
| `goals` | `string[]` | ✅ | What they're trying to accomplish |
| `personalityTraits` | `string[]` | ✅ | 3-5 descriptive adjectives |
| `conscientiousness` | `number` | ✅ | 0-100: Meticulous vs Chaotic |
| `neuroticism` | `number` | ✅ | 0-100: Anxious vs Stable |
| `openness` | `number` | ✅ | 0-100: Curious vs Traditional |
| `extraversion` | `number` | ✅ | 0-100: Outgoing vs Solitary |
| `agreeableness` | `number` | ✅ | 0-100: Compassionate vs Competitive |
| `cognitiveReflex` | `number` | ✅ | 0-100: System 1 (intuitive) to System 2 (analytical) |
| `technicalFluency` | `number` | ✅ | 0-100: Luddite to Hacker |
| `economicSensitivity` | `number` | ✅ | 0-100: Price indifferent to Penny pincher |
| `designStyle` | `string` | ✅ | Preferred aesthetic (e.g., "Minimalist", "Industrial") |
| `livingEnvironment` | `string` | ✅ | Description of their workspace/home |
| `backstory` | `string` | Optional | Pre-generated persona backstory |
| `aiInsight` | `string` | Optional | AI-generated behavioral insight |

### Minimal Persona Example

Only `id` and `name` are strictly required, but comprehensive personas produce better analysis:

```json
{
  "id": "tech-buyer-1",
  "name": "Alex Rivera"
}
```

For meaningful analysis, provide at least:
- `id`, `name` (required)
- `occupation`, `goals` (drives evaluation criteria)
- `economicSensitivity` (price sensitivity)
- `technicalFluency` (technical comprehension level)

## Response

### Success (200 OK)

```json
{
  "requestId": "report-1745034567890",
  "url": "https://your-pricing-page.com",
  "personaCount": 1,
  "analyses": [
    {
      "id": "persona-1-1745034567891",
      "url": "https://your-pricing-page.com",
      "screenshotBase64": "/9j/4AAQSkZJRg...",
      "thoughts": "Looking at the pricing page, I first notice...",
      "scores": {
        "clarity": 7,
        "valuePerception": 8,
        "trust": 6,
        "likelihoodToBuy": 5
      },
      "concerns": [
        "The enterprise tier pricing seems vague about what's included",
        "No clear ROI calculator to justify the expense",
        "Trial period is only 7 days - too short to properly evaluate"
      ],
      "gutReaction": "Overall I'm impressed but have reservation about the value at the enterprise level.",
      "observation": "Consider adding a feature comparison table and ROI calculator to help buyers justify the expense."
    }
  ]
}
```

### Error Responses

**400 Bad Request** - Invalid input:
```json
{
  "error": "Missing or invalid 'personas' parameter - must be a non-empty array"
}
```

Validation errors include specific index and field:
```json
{
  "error": "Invalid persona at index 1: missing or invalid 'id' field"
}
```

**500 Internal Server Error** - Server-side failure:
```json
{
  "error": "Failed to navigate to page: timeout exceeded"
}
```

## Analysis Fields

Each analysis in the `analyses` array contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique analysis ID |
| `url` | `string` | Analyzed URL |
| `screenshotBase64` | `string` | Captured viewport as base64 JPEG |
| `thoughts` | `string` | Persona stream-of-consciousness evaluation (2 paragraphs) |
| `scores` | `object` | Quantitative scores (1-10 scale) |
| `concerns` | `string[]` | 3 specific hesitation points |
| `gutReaction` | `string` | One-sentence immediate reaction |
| `observation` | `string` | Actionable design insight |
| `rawAnalysis` | `string` | Raw stream content (if available) |
| `gazePoints` | `GazePoint[]` | Predicted eye-tracking focus areas |

### Score Definitions

| Score | Range | Description |
|-------|-------|-------------|
| `clarity` | 1-10 | How easily can they understand the pricing? |
| `valuePerception` | 1-10 | Do they perceive value for the price? |
| `trust` | 1-10 | How much do they trust the offering? |
| `likelihoodToBuy` | 1-10 | What's their probability of purchase? |

## Usage Examples

### Test Loop Integration

```typescript
async function runPricingTests() {
  const personas = await generateTestPersonas(5);
  const results = [];

  for (const url of pricingPages) {
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, personas })
    });

    const data = await response.json();

    // Aggregate scores
    const avgClarity = data.analyses.reduce((sum, a) => sum + a.scores.clarity, 0) / data.analyses.length;

    results.push({ url, avgClarity, raw: data });
  }

  return results;
}
```

### Batch Processing

```typescript
async function analyzeCompetitorPricing(competitorUrls: string[]) {
  const persona = getBaselinePersona();

  const reports = await Promise.all(
    competitorUrls.map(url =>
      fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, personas: [persona] })
      }).then(r => r.json())
    )
  );

  return reports.map((report, i) => ({
    url: competitorUrls[i],
    clarity: report.analyses[0].scores.clarity,
    trust: report.analyses[0].scores.trust
  }));
}
```

### CI/CD Integration

```yaml
# GitHub Actions example
- name: Run pricing page analysis
  run: |
    REPORT=$(curl -s -X POST http://localhost:3000/api/report \
      -H "Content-Type: application/json" \
      -d '{"url": "${{ env.PRICING_URL }}", "personas": [{{ values.persona }}]}')
    echo "$REPORT" | jq '.analyses[].scores'
    CLARITY=$(echo "$REPORT" | jq '.analyses[].scores.clarity')
    if (( $(echo "$CLARITY < 5" | bc -l) )); then
      echo "Clarity score below threshold"
      exit 1
    fi
```

## Rate Limits

The API is rate-limited to prevent abuse:
- **5 requests per minute** per IP address
- Returns `429 Too Many Requests` when exceeded

```json
{
  "error": "Rate limit exceeded. Try again in 30 seconds.",
  "requestId": "report-xxx"
}
```

## Error Handling

Always check the HTTP status code and handle errors gracefully:

```typescript
async function fetchReport(url: string, personas: Persona[]) {
  const response = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, personas })
  });

  if (!response.ok) {
    const error = await response.json();

    if (response.status === 400) {
      throw new ValidationError(error.error);
    } else if (response.status === 429) {
      throw new RateLimitError(error.error);
    } else {
      throw new AnalysisError(error.error);
    }
  }

  return response.json();
}
```

## Performance Tips

1. **Parallel requests**: Process multiple URLs concurrently (respect rate limits)
2. **Reuse personas**: Generate personas once, cache and reuse across requests
3. **Pre-capture screenshots**: Use `imageBase64` parameter to skip browser capture when you already have screenshots
4. **Persona count**: 3-5 personas provides good coverage without excessive latency

## Related

- [Architecture Guide](./ARCHITECTURE.md) - System design and patterns
- [Generate Personas Action](../src/actions/generatePersonas.ts) - Create personas programmatically
- [PricingAnalysis Entity](../src/domain/entities/PricingAnalysis.ts) - Type definitions