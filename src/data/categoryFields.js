// Extra questions asked per category. Answers are stored in listings.details (jsonb),
// so adding or changing a field here needs no database change.
const yesNo = ['Yes', 'No']

export const categoryFields = {
  'vehicles-transportation': [
    { key: 'vehicleType', label: 'Vehicle type', options: ['Motorcycle', 'Car', 'Van', 'Truck', 'Bicycle', 'Other'] },
    { key: 'makeModel', label: 'Make and model' },
    { key: 'year', label: 'Year', type: 'number' },
    { key: 'withDriver', label: 'Driver included', options: yesNo },
  ],
  'residential-properties': [
    { key: 'propertyType', label: 'Property type', options: ['Room', 'Apartment', 'House', 'Boarding house or dorm', 'Other'] },
    { key: 'bedrooms', label: 'Bedrooms', type: 'number' },
    { key: 'bathrooms', label: 'Bathrooms', type: 'number' },
    { key: 'furnished', label: 'Furnished', options: ['Yes', 'Partly', 'No'] },
  ],
  'commercial-properties': [
    { key: 'spaceType', label: 'Space type', options: ['Office', 'Shop or stall', 'Warehouse', 'Event venue', 'Other'] },
    { key: 'floorArea', label: 'Floor area (sq m)', type: 'number' },
    { key: 'parking', label: 'Parking available', options: yesNo },
  ],
  'land-lots': [
    { key: 'lotArea', label: 'Lot area (sq m)', type: 'number' },
    { key: 'intendedUse', label: 'Suitable for' },
  ],
  'tools-machinery-equipment': [
    { key: 'equipmentType', label: 'Equipment type' },
    { key: 'brandModel', label: 'Brand and model' },
    { key: 'operatorIncluded', label: 'Operator included', options: yesNo },
  ],
  'electronics-gadgets': [
    { key: 'itemType', label: 'Item type' },
    { key: 'brandModel', label: 'Brand and model' },
    { key: 'accessories', label: 'Included accessories' },
  ],
  'events-parties-recreation': [
    { key: 'itemType', label: 'Item type' },
    { key: 'quantity', label: 'Quantity available', type: 'number' },
    { key: 'setupIncluded', label: 'Setup included', options: yesNo },
  ],
  'furniture-household': [
    { key: 'itemType', label: 'Item type' },
    { key: 'quantity', label: 'Quantity available', type: 'number' },
  ],
  'clothing-special-occasion': [
    { key: 'itemType', label: 'Item type' },
    { key: 'size', label: 'Size' },
    { key: 'occasion', label: 'Suitable occasion' },
  ],
  other: [],
}

export const fieldsFor = (slug) => categoryFields[slug] ?? []
