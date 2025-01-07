import { JwtService } from './jwt.service';
import * as jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');

describe('JwtService', () => {
  let jwtService: JwtService;
  const secretKey = 'test-secret';
  const mockToken = 'mockToken';

  beforeEach(() => {
    jwtService = new JwtService();
    process.env.ADMIN_TOKEN_SECRET = secretKey;  
  });

  afterEach(() => {
    jest.clearAllMocks();  
  });

  describe('getSignedToken', () => {
    it('should return a signed token', async () => {
      const payload = {
        roles: ['DIRECTORYADMIN'],
        exp: expect.any(Number), 
      };
      (jwt.sign as jest.Mock).mockReturnValue(mockToken);
      const token = await jwtService.getSignedToken();
      expect(jwt.sign).toHaveBeenCalledWith(payload, secretKey);
      expect(token).toBe(mockToken);
    });
  });

  describe('validateToken', () => {
    it('should validate the token successfully', async () => {
      const decodedPayload = { roles: ['DIRECTORYADMIN'] };
      (jwt.verify as jest.Mock).mockReturnValue(decodedPayload);
      const result = await jwtService.validateToken(mockToken);
      expect(jwt.verify).toHaveBeenCalledWith(mockToken, secretKey);
      expect(result).toBe(decodedPayload);
    });

    it('should throw an error if token verification fails', async () => {
    
      const errorMessage = 'Token is invalid';
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error(errorMessage);
      });
      await expect(jwtService.validateToken(mockToken)).rejects.toThrow(
        errorMessage,
      );
      expect(jwt.verify).toHaveBeenCalledWith(mockToken, secretKey);
    });
  });
});
