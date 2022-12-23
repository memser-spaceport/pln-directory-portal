import { cleanup, render } from '@testing-library/react';
import { ContactMethod } from './contact-method';

afterEach(cleanup);

describe('ContactMethod', () => {
  it('should render a tooltip with the contact method as the content when the contact method is provided', () => {
    const contactMethod = 'test@example.com';
    const { getByText } = render(
      <ContactMethod contactMethod={contactMethod} />
    );
    const tooltip = getByText(contactMethod);

    expect(tooltip).toBeInTheDocument();
  });

  it('should render a profile social link with the `mailto:` prefix in the `href` when the contact method is an email address', () => {
    const contactMethod = 'test@example.com';
    const { getByTestId } = render(
      <ContactMethod contactMethod={contactMethod} />
    );
    const socialLink = getByTestId('profile-social-link');

    expect(socialLink).toHaveAttribute('href', `mailto:${contactMethod}`);
  });

  it('should render a profile social link with the original URL when the contact method is not an email address', () => {
    const contactMethod = 'https://example.com';
    const { getByTestId } = render(
      <ContactMethod contactMethod={contactMethod} />
    );
    const socialLink = getByTestId('profile-social-link');

    expect(socialLink).toHaveAttribute('href', contactMethod);
  });

  it('should render a hyphen when the contact method is not provided', () => {
    const { getByText } = render(<ContactMethod />);
    const hyphen = getByText('-');

    expect(hyphen).toBeInTheDocument();
  });
});
