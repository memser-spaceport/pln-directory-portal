import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InputField } from './input-field';

describe('InputField', () => {
  it('should have an empty string as value', () => {
    render(<InputField label="test" />);

    const inputEl = screen.getByRole('textbox') as HTMLInputElement;
    expect(inputEl.value).toBe('');
  });

  it('should give the ability to clear the input value through a clear button', () => {
    render(<InputField label="Test" defaultValue="string" hasClear />);

    const clearBtn = screen.getByRole('button');
    expect(clearBtn).toBeInTheDocument();

    const inputEl = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.click(clearBtn);
    expect(inputEl.value).toBe('');
  });

  it('should call the function passed trough prop onClear after click on clear button', () => {
    const handleClear = jest.fn();

    render(
      <InputField
        label="Test"
        defaultValue="string"
        hasClear={true}
        onClear={handleClear}
      />
    );

    const clearBtn = screen.getByRole('button');
    fireEvent.click(clearBtn);
    expect(handleClear).toHaveBeenCalledTimes(1);
  });

  it('should call the function passed as prop onChange', async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <InputField label="Test" defaultValue="string" onChange={handleChange} />
    );
    const inputEl = screen.getByRole('textbox');
    await user.type(inputEl, 'abc');
    expect(handleChange).toHaveBeenCalledTimes(3);
  });

  it('should call the function passed as prop onKeyUp', async () => {
    const handleKeyUp = jest.fn();
    const user = userEvent.setup();

    render(
      <InputField label="Test" defaultValue="string" onKeyUp={handleKeyUp} />
    );
    const inputEl = screen.getByRole('textbox');
    await user.type(inputEl, '{enter}');
    expect(handleKeyUp).toHaveBeenCalledTimes(1);
  });
});
