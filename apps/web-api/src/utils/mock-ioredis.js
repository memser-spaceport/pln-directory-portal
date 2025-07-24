class MockRedis {
  constructor() {}
  async get() { return null; }
  async set() { return 'OK'; }
  async quit() { return 'OK'; }
  // Add other methods as needed
}
module.exports = MockRedis; 