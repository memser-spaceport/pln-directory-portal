import { MongoPersistantDbService } from './mongo-persistant-db.service';

const mockCollection = {
  insertOne: jest.fn(),
  updateOne: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};
const mockConnect = jest.fn();
const mockClose = jest.fn();

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    db: jest.fn().mockReturnValue({ collection: jest.fn().mockReturnValue(mockCollection) }),
  })),
}));

describe('MongoPersistantDbService', () => {
  let service: MongoPersistantDbService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockCollection.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([{ threadId: 't1' }]) }),
    });
    service = new MongoPersistantDbService();
  });

  it('connects eagerly on module init without throwing when Mongo is unreachable', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('re-establishes the connection before each operation', async () => {
    await service.findByKeyValue('threads', 'email', 'a@b.c');
    await service.findOneByKeyValue('threads', 'threadId', 't1');
    await service.create('threads', { threadId: 't2' });

    expect(mockConnect).toHaveBeenCalledTimes(3);
    expect(mockCollection.find).toHaveBeenCalledWith({ email: 'a@b.c', isDeleted: { $ne: true } });
    expect(mockCollection.insertOne).toHaveBeenCalledWith({ threadId: 't2' });
  });

  it('surfaces the connection error instead of a stale "Topology is closed" state', async () => {
    mockConnect.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    await expect(service.findByKeyValue('threads', 'email', 'a@b.c')).rejects.toThrow('connect ECONNREFUSED');

    const threads = await service.findByKeyValue('threads', 'email', 'a@b.c');
    expect(threads).toEqual([{ threadId: 't1' }]);
    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
