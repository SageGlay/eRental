// The ten approved eRental categories. Keep the names exactly as written.
// These will move to a Supabase table later; the slug is used in URLs.
export const categories = [
  { slug: 'vehicles-transportation', name: 'Vehicles and Transportation', emoji: '🚗' },
  { slug: 'residential-properties', name: 'Residential Properties and Accommodation', emoji: '🏠' },
  { slug: 'commercial-properties', name: 'Commercial Properties and Business Spaces', emoji: '🏢' },
  { slug: 'land-lots', name: 'Land and Lots', emoji: '🌳' },
  { slug: 'tools-machinery-equipment', name: 'Tools, Machinery, and Construction Equipment', emoji: '🛠️' },
  { slug: 'electronics-gadgets', name: 'Electronics and Gadgets', emoji: '💻' },
  { slug: 'events-parties-recreation', name: 'Events, Parties, and Recreation', emoji: '🎉' },
  { slug: 'furniture-household', name: 'Furniture and Household Equipment', emoji: '🛋️' },
  { slug: 'clothing-special-occasion', name: 'Clothing and Special Occasion Items', emoji: '👗' },
  { slug: 'other', name: 'Other Rental Categories', emoji: '📦' },
]
