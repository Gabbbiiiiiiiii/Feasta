String providerCategoryLabel(String category) {
  switch (category) {
    case 'catering_service':
      return 'Catering Service';
    case 'food_trays_packed_meals':
      return 'Food Trays / Packed Meals';
    case 'catering_event_styling':
      return 'Catering and Event Styling';
    case 'photographer':
      return 'Photographer';
    case 'videographer':
      return 'Videographer';
    case 'photo_booth':
      return 'Photo Booth';
    case 'event_coordinator':
      return 'Event Coordinator';
    case 'event_host_emcee':
      return 'Event Host / Emcee';
    case 'sound_system':
      return 'Sound System';
    case 'lights_and_sounds':
      return 'Lights and Sounds';
    case 'singer_band':
      return 'Singer / Band';
    case 'dancer_performer':
      return 'Dancer / Performer';
    case 'decorator_event_stylist':
      return 'Decorator / Event Stylist';
    case 'florist':
      return 'Florist';
    case 'cake_provider':
      return 'Cake Provider';
    case 'gown_suit_rental':
      return 'Gown / Suit Rental';
    case 'car_rental':
      return 'Car Rental';
    case 'venue_provider':
      return 'Venue Provider';
    case 'tables_chairs_rental':
      return 'Tables and Chairs Rental';
    case 'other_event_service':
      return 'Other Event Service';
    default:
      return category;
  }
}