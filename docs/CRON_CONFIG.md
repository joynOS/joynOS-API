# Daily Event Ingestion Cron Configuration

## Overview
The system includes an automated daily cron job that fetches events from multiple sources (Yelp, Ticketmaster, Google Places, etc.) and creates them in the database with AI analysis.

## Cron Schedule
- **Default Schedule**: Every day at 3:00 AM EST
- **Timezone**: America/New_York
- **Decorator**: `@Cron('0 3 * * *')`

## Key Features

### 1. AI Health Check
- Tests AI service before processing any events
- Stops immediately if AI is down or quota exceeded
- Prevents creating events without proper AI analysis

### 2. Region Rotation
- Processes 6 different NYC regions each day
- Rotates regions based on day of week to avoid duplicates
- Covers 20 distinct NYC neighborhoods throughout the week

### 3. Mixed Event Sources
- 65% from external APIs (Yelp, Ticketmaster, etc.)
- 35% from Google Places synthetic events
- Creates 3 events per region by default (18 total per day)

### 4. Automatic Cleanup
- Removes events older than 30 days that have no members
- Preserves events with member activity

## Environment Variables

Add these to your `.env` file:

```env
# Cron Job Configuration
DISABLE_CRON_JOBS=false                    # Set to true to disable all cron jobs
MAX_EVENTS_PER_REGION=3                    # Number of events to create per region (default: 3)
EVENTS_RETENTION_DAYS=30                   # Days to keep old events (default: 30)

# External APIs (required for cron to work properly)
EXTERNAL_APIS_ENABLED=true
YELP_API_ENABLED=true
YELP_API_KEY=your_yelp_api_key_here
TICKETMASTER_API_KEY=your_ticketmaster_key_here
GOOGLE_PLACES_API_KEY=your_google_places_key_here

# AI Configuration (CRITICAL - cron will fail without this)
GOOGLE_AI_API_KEY=your_gemini_api_key_here
```

## Manual Trigger

You can manually trigger the cron job for testing:

```bash
# Via API endpoint (requires authentication)
curl -X POST http://localhost:3000/ingestion/trigger-daily \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# With custom max events per region
curl -X POST http://localhost:3000/ingestion/trigger-daily?maxEventsPerRegion=5 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Monitoring

The cron service logs detailed information:

- `🔄 Starting daily event ingestion...` - Cron job started
- `✅ AI health check passed` - AI is working
- `❌ AI health check failed` - AI is down (job will stop)
- `✅ Created X events in [Region]` - Success per region
- `📊 DAILY INGESTION SUMMARY` - Final summary with stats

## Regions Covered

### Manhattan
- SoHo, Tribeca, Chelsea
- East Village, West Village, Lower East Side
- Upper East Side, Upper West Side, Harlem
- Midtown, Financial District

### Brooklyn
- Williamsburg, DUMBO
- Park Slope, Brooklyn Heights
- Bushwick

### Queens
- Astoria, Long Island City, Flushing

### Bronx
- Riverdale, Arthur Avenue

## Troubleshooting

### Cron not running
1. Check if `DISABLE_CRON_JOBS=true` in `.env`
2. Verify ScheduleModule is imported in AppModule
3. Check server logs for errors

### AI failures
1. Verify `GOOGLE_AI_API_KEY` is valid
2. Check Google AI quota limits
3. Upgrade to paid plan if hitting free tier limits

### No events created
1. Verify all external API keys are configured
2. Check if APIs are enabled (`EXTERNAL_APIS_ENABLED=true`)
3. Review logs for specific region failures

## Daily Event Capacity

With default settings:
- **6 regions** × **3 events** = **18 events per day**
- **126 events per week**
- **~540 events per month**

Adjust `MAX_EVENTS_PER_REGION` to increase/decrease volume.

## Important Notes

1. **AI is mandatory** - The cron will not create events without AI analysis
2. **Quota management** - Monitor your API quotas, especially Google AI
3. **Region variety** - Events rotate through different NYC neighborhoods daily
4. **Automatic cleanup** - Old inactive events are removed automatically
5. **Overlap prevention** - The service prevents multiple simultaneous runs