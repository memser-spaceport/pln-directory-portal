import { render } from '@testing-library/react';

import SampleComponent from './sample-component';

describe('SampleComponent', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<SampleComponent />);
    expect(baseElement).toBeTruthy();
  });
});
