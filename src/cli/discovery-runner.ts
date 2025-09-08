#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DiscoveryService } from '../modules/ingestion/services/discovery.service';
import { Logger } from '@nestjs/common';

interface DiscoveryConfig {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  maxRegions: number;
  maxEventsPerRegion: number;
  diversityMode: boolean;
  dryRun: boolean;
  preset?: 'manhattan' | 'brooklyn' | 'queens' | 'custom';
}

// NYC Area Presets
const NYC_PRESETS = {
  manhattan: {
    centerLat: 40.7831,
    centerLng: -73.9712,
    radiusKm: 8,
    description: 'Manhattan - Central Park area covering most of Manhattan',
  },
  brooklyn: {
    centerLat: 40.6782,
    centerLng: -73.9442,
    radiusKm: 6,
    description: 'Brooklyn - Downtown/Park Slope area',
  },
  queens: {
    centerLat: 40.7282,
    centerLng: -73.7949,
    radiusKm: 5,
    description: 'Queens - Long Island City/Astoria area',
  },
};

class DiscoveryRunner {
  private readonly logger = new Logger(DiscoveryRunner.name);

  async run() {
    const config = this.parseArguments();

    this.logger.log('🚀 Starting NYC Event Discovery...');
    this.printConfig(config);

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    try {
      const discoveryService = app.get(DiscoveryService);

      if (config.dryRun) {
        this.logger.log('🔍 Running discovery preview (dry run)...');
        const preview = await discoveryService.discoverPreview({
          centerLat: config.centerLat,
          centerLng: config.centerLng,
          radiusKm: config.radiusKm,
          maxRegions: config.maxRegions,
          diversityMode: config.diversityMode,
        });

        this.printPreviewResults(preview);
      } else {
        this.logger.log('🎯 Generating events...');
        const result = await discoveryService.discoverAndGenerate({
          centerLat: config.centerLat,
          centerLng: config.centerLng,
          radiusKm: config.radiusKm,
          maxRegions: config.maxRegions,
          maxEventsPerRegion: config.maxEventsPerRegion,
          diversityMode: config.diversityMode,
          dryRun: false,
        });

        this.printGenerationResults(result);
      }
    } catch (error) {
      this.logger.error('❌ Discovery failed:', error.message);
      process.exit(1);
    } finally {
      await app.close();
    }
  }

  private parseArguments(): DiscoveryConfig {
    const args = process.argv.slice(2);
    const config: DiscoveryConfig = {
      centerLat: 40.7831, // Manhattan default
      centerLng: -73.9712,
      radiusKm: 5,
      maxRegions: 6,
      maxEventsPerRegion: 2,
      diversityMode: true,
      dryRun: false,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];

      switch (arg) {
        case '--preset':
        case '-p':
          if (nextArg && NYC_PRESETS[nextArg as keyof typeof NYC_PRESETS]) {
            const preset = NYC_PRESETS[nextArg as keyof typeof NYC_PRESETS];
            config.centerLat = preset.centerLat;
            config.centerLng = preset.centerLng;
            config.radiusKm = preset.radiusKm;
            config.preset = nextArg as any;
            i++; // Skip next arg
          }
          break;

        case '--lat':
          if (nextArg && !isNaN(Number(nextArg))) {
            config.centerLat = Number(nextArg);
            i++;
          }
          break;

        case '--lng':
          if (nextArg && !isNaN(Number(nextArg))) {
            config.centerLng = Number(nextArg);
            i++;
          }
          break;

        case '--radius':
        case '-r':
          if (nextArg && !isNaN(Number(nextArg))) {
            config.radiusKm = Number(nextArg);
            i++;
          }
          break;

        case '--regions':
          if (nextArg && !isNaN(Number(nextArg))) {
            config.maxRegions = Number(nextArg);
            i++;
          }
          break;

        case '--events-per-region':
          if (nextArg && !isNaN(Number(nextArg))) {
            config.maxEventsPerRegion = Number(nextArg);
            i++;
          }
          break;

        case '--no-diversity':
          config.diversityMode = false;
          break;

        case '--dry-run':
        case '-d':
          config.dryRun = true;
          break;

        case '--help':
        case '-h':
          this.printHelp();
          process.exit(0);
          break;
      }
    }

    return config;
  }

  private printHelp() {
    console.log(`
🎯 NYC Event Discovery CLI

USAGE:
  npm run discovery [options]

OPTIONS:
  --preset, -p <preset>         Use NYC area preset (manhattan|brooklyn|queens)
  --lat <latitude>              Center latitude (default: 40.7831 - Manhattan)
  --lng <longitude>             Center longitude (default: -73.9712 - Manhattan)
  --radius, -r <km>             Search radius in kilometers (default: 5)
  --regions <number>            Max regions to discover (default: 6)
  --events-per-region <number>  Max events per region (default: 2)
  --no-diversity                Disable diversity filtering
  --dry-run, -d                 Preview only, don't create events
  --help, -h                    Show this help

PRESETS:
  manhattan    Manhattan - Central Park area (radius: 8km)
  brooklyn     Brooklyn - Downtown/Park Slope (radius: 6km)  
  queens       Queens - LIC/Astoria (radius: 5km)

EXAMPLES:
  npm run discovery                              # Manhattan default
  npm run discovery --preset brooklyn           # Brooklyn preset
  npm run discovery --dry-run                   # Preview only
  npm run discovery --radius 3 --regions 4     # Custom parameters
  npm run discovery --lat 40.7589 --lng -73.9851 --radius 2
    `);
  }

  private printConfig(config: DiscoveryConfig) {
    const presetInfo = config.preset ? ` (${config.preset} preset)` : '';

    console.log(`
📍 Discovery Configuration${presetInfo}:
   Center: ${config.centerLat}, ${config.centerLng}
   Radius: ${config.radiusKm}km
   Max Regions: ${config.maxRegions}
   Events per Region: ${config.maxEventsPerRegion}
   Diversity Mode: ${config.diversityMode ? 'ON' : 'OFF'}
   Mode: ${config.dryRun ? 'DRY RUN (preview only)' : 'LIVE (creating events)'}
`);
  }

  private printPreviewResults(preview: any) {
    console.log(`
🔍 DISCOVERY PREVIEW RESULTS:

📊 Summary:
   Regions Found: ${preview.regions.length}
   Total Venues: ${preview.summary.totalVenuesFound}
   Avg Venues/Region: ${preview.summary.averageVenuesPerRegion.toFixed(1)}
   Popular Vibes: ${preview.summary.mostCommonVibes.join(', ')}

🏙️ Discovered Regions:`);

    preview.regions.forEach((region: any, index: number) => {
      console.log(`
   ${index + 1}. ${region.regionName}
      Location: ${region.center.lat.toFixed(4)}, ${region.center.lng.toFixed(4)}
      Venues: ${region.venueCount} (avg rating: ${region.averageRating.toFixed(1)})
      Top Vibes: ${region.vibesRanked
        .slice(0, 3)
        .map((v: any) => `${v.vibeKey} (${(v.score * 100).toFixed(0)}%)`)
        .join(', ')}
      Sample Venues: ${region.sampleVenues
        .slice(0, 3)
        .map((v: any) => v.name)
        .join(', ')}`);
    });

    console.log(`
💡 To generate these events for real, run without --dry-run flag.
`);
  }

  private printGenerationResults(result: any) {
    console.log(`
✅ EVENT GENERATION COMPLETED!

📊 Summary:
   Regions Processed: ${result.summary.totalRegionsProcessed}
   Events Created: ${result.summary.eventsCreated}
   Events Skipped: ${result.summary.eventsSkipped}

🎉 Created Events:`);

    result.created.forEach((event: any, index: number) => {
      const startTime = new Date(event.startTime).toLocaleString();
      console.log(`
   ${index + 1}. ${event.regionName} — ${event.vibeKey}
      Event ID: ${event.eventId}
      Time: ${startTime}`);
    });

    if (result.skipped.length > 0) {
      console.log(`\n⚠️  Skipped Events:`);
      result.skipped.forEach((skip: any, index: number) => {
        console.log(
          `   ${index + 1}. ${skip.regionName} — ${skip.vibeKey}: ${skip.reason}`,
        );
      });
    }

    console.log(`
🚀 All events are now live and ready for users to discover!
   Check the admin panel or API to view the created events.
`);
  }
}

// Run the script
if (require.main === module) {
  const runner = new DiscoveryRunner();
  runner.run().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

export { DiscoveryRunner };
