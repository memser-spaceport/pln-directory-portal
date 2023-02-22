jest.mock('axios', () => {
  const axios = jest.requireActual('axios');
  const regexPlace = /maps.googleapis.com\/maps\/api\/place\/autocomplete/;
  const regexGeocode = /maps.googleapis.com\/maps\/api\/geocode/;
  const regexZeroResults =
    /maps.googleapis.com\/maps\/api\/place\/autocomplete\/json\?types=\(regions\)&input\=not/;
  const regexNoPredictions =
    /maps.googleapis.com\/maps\/api\/place\/autocomplete\/json\?types=\(regions\)&input\=noPrediction/;
  const regexNoRequiredPlace =
    /maps.googleapis.com\/maps\/api\/place\/autocomplete\/json\?types=\(regions\)&input\=noRequiredPlace/;
  return {
    ...axios,
    get: jest.fn().mockImplementation((url) => {
      switch (true) {
        case regexZeroResults.test(url):
          return Promise.resolve({
            data: {
              status: 'ZERO_RESULTS',
            },
          });
        case regexNoPredictions.test(url):
          return Promise.resolve({
            data: {
              status: 'OK',
            },
          });
        case regexNoRequiredPlace.test(url):
          return Promise.resolve({
            data: {
              status: 'OK',
              predictions: [],
            },
          });
        case regexPlace.test(url):
          return Promise.resolve({
            data: {
              predictions: [
                {
                  description: 'Austin, TX, United States',
                  place_id: 'ChIJLwPMoJm1RIYRetVp1EtGm10',
                  reference: 'ChIJLwPMoJm1RIYRetVp1EtGm10',
                  structured_formatting: {
                    main_text: 'Austin',
                    main_text_matched_substrings: [Array],
                    secondary_text: 'TX, United States',
                    secondary_text_matched_substrings: [Array],
                  },
                  types: ['locality', 'political', 'geocode'],
                },
                {
                  description: 'Austin, MN, United States',
                  place_id: 'ChIJffSKNVXF8IcR7z58vRXIRcM',
                  reference: 'ChIJffSKNVXF8IcR7z58vRXIRcM',
                  structured_formatting: {
                    main_text: 'Austin',
                    main_text_matched_substrings: [Array],
                    secondary_text: 'MN, United States',
                    secondary_text_matched_substrings: [Array],
                  },
                  types: ['locality', 'political', 'geocode'],
                },
                {
                  description:
                    'United States Postal Service, Menchaca Rd, Austin, TX, USA',
                  place_id: 'ChIJiQ97MZ9MW4YR9rm5juevVhs',
                  reference: 'ChIJiQ97MZ9MW4YR9rm5juevVhs',
                  structured_formatting: {
                    main_text: 'United States Postal Service',
                    main_text_matched_substrings: [Array],
                    secondary_text: 'Menchaca Rd, Austin, TX, USA',
                    secondary_text_matched_substrings: [Array],
                  },
                  types: [
                    'post_office',
                    'local_government_office',
                    'finance',
                    'point_of_interest',
                    'establishment',
                  ],
                },
              ],
              status: 'OK',
            },
          });
        case regexGeocode.test(url):
          return Promise.resolve({
            data: {
              results: [
                {
                  address_components: [
                    {
                      long_name: 'Austin',
                      short_name: 'Austin',
                      types: ['locality', 'political'],
                    },
                    {
                      long_name: 'Travis County',
                      short_name: 'Travis County',
                      types: ['administrative_area_level_2', 'political'],
                    },
                    {
                      long_name: 'Texas',
                      short_name: 'TX',
                      types: ['administrative_area_level_1', 'political'],
                    },
                    {
                      long_name: 'United States',
                      short_name: 'US',
                      types: ['country', 'political'],
                    },
                  ],
                  geometry: {
                    bounds: {
                      northeast: { lat: 30.5168629, lng: -97.57310199999999 },
                      southwest: { lat: 30.0986589, lng: -97.9383829 },
                    },
                    location: { lat: 30.267153, lng: -97.7430608 },
                    location_type: 'APPROXIMATE',
                    viewport: {
                      northeast: { lat: 30.5168629, lng: -97.57310199999999 },
                      southwest: { lat: 30.0986589, lng: -97.9383829 },
                    },
                  },
                  place_id: 'ChIJLwPMoJm1RIYRetVp1EtGm10',
                  types: ['locality', 'political'],
                },
              ],
            },
            status: 'OK',
          });
        default:
          return Promise.reject(new Error('not found'));
      }
    }),
  };
});
