import { fireEvent, render, screen } from '@testing-library/react';
import { Dropdown, IDropdownOption } from './dropdown';

const options: IDropdownOption[] = [
  { label: 'Apples', value: 'apples' },
  { label: 'Bananas', value: 'bananas' },
];

describe('Dropdown', () => {
  it('should have the first option selected by default', () => {
    render(<Dropdown options={options} />);
    const dropdownBtn = screen.getByTestId('dropdown__button');
    expect(dropdownBtn.textContent).toEqual('Apples');
  });

  it('should have the appropriate option selected by default when an initial option gets passed as a prop', () => {
    render(<Dropdown options={options} initialOption={options[1]} />);
    const dropdownBtn = screen.getByTestId('dropdown__button');
    expect(dropdownBtn.textContent).toEqual(options[1].label);
  });

  it('should update the selected option when the user changes the selection', () => {
    render(<Dropdown options={options} />);

    const dropdownBtn = screen.getByTestId('dropdown__button');
    fireEvent.click(dropdownBtn);

    const secondOption = screen.getByText(options[1].label);
    fireEvent.click(secondOption);

    expect(dropdownBtn.textContent).toEqual(options[1].label);
  });
});
