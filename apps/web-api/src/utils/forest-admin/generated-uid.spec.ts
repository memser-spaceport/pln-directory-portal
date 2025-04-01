import { generateUid } from './generated-uid';
import cuid from 'cuid';

jest.mock('cuid');

describe('generateUid', () => {
  let mockCollection;
  let dataSource;

  beforeEach(() => {
    mockCollection = {
      schema: {
        fields: {
          uid: true,
        },
      },
      addHook: jest.fn(),
    };

    dataSource = {
      collections: [mockCollection],
    };

    (cuid as unknown as jest.Mock).mockReturnValue('12345');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate uid', async () => {
    await generateUid(dataSource, null, {});

    expect(mockCollection.addHook).toHaveBeenCalledWith('Before', 'Create', expect.any(Function));

    const beforeCreateHook = mockCollection.addHook.mock.calls[0][2];

    const mockContext = {
      _data: [{ uid: '' }],
    };
    await beforeCreateHook(mockContext);
    expect(cuid).toHaveBeenCalled();
  });
});
