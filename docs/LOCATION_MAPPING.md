# 🌍 Location Mapping: Airtable <> Google Places API <> PLN API

This document aims at providing a clear view of how the fields are being mapped from the PLN API to Airtable and how the Google Places API is being used to properly map the locations.

The table below represents how we are mapping the fields from the API to Airtable, identifying the fields that are being mapped through the Google Places API, and the ones that are being mapped manually.

| Airtable field   |   Google Places API type    |     Manual Mapping |  PLN Location entity field |
| ---------------- | :-------------------------: | -----------------: | -------------------------: |
| region           |              -              | :white_check_mark: |                  continent |
| country          |           country           |                  - |                    country |
| state / province | administrative_area_level_1 |                  - | region/region_abbreviation |
| city             |          locality           |                  - |                       city |
| metro Area       |              -              | :white_check_mark: |                 metro_area |

## Google Places API - Rules & Transformations 🎯

When creating a new location, we fetch the corresponding location and fill out the necessary fields with the information received from the Google Maps API. This way we can have consistent locations throughout the entire API.

### Rules

1. There needs to exist at least a country or city;
2. Google Places API needs to find a relevant place with the information provided.

After applying these rules, the script will find a place among four different types of places: `locality`, `administrative_area_level_1`, `country`, and `natural_feature`.

After finding the place, it will request all the information to the **Geocode API**, which will map the fields to the corresponding types as shown in the table above.

This will convert Airtable location data to more consistent data provided by the Google Places API.
