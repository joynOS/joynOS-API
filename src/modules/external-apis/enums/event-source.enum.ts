export enum EventSource {
  // Current system
  REGION_SYNTHETIC = 'region_synthetic',

  // External APIs
  YELP = 'yelp',
  MEETUP = 'meetup',
  SEATGEEK = 'seatgeek',
  NYC_PARKS = 'nyc_parks',

  TICKETMASTER = 'ticketmaster',

  // Future integrations
  BANDSINTOWN = 'bandsintown',
  FOURSQUARE = 'foursquare',
}

export const EXTERNAL_SOURCES = [
  EventSource.YELP,
  EventSource.MEETUP,
  EventSource.SEATGEEK,
  EventSource.NYC_PARKS,
  EventSource.TICKETMASTER,
];

export const SYNTHETIC_SOURCES = [EventSource.REGION_SYNTHETIC];
