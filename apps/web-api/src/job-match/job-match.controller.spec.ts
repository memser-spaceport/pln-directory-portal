// The real service pulls in MembersService, and the session guard imports axios (ESM); neither is exercised
// here, so both are stubbed at the module boundary.
jest.mock('./job-match.service', () => ({ JobMatchService: class {} }));
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import { BadRequestException } from '@nestjs/common';
import { JobMatchController } from './job-match.controller';
import type { JobMatchService } from './job-match.service';

describe('JobMatchController lead actions (LAB-2846)', () => {
  let service: { updateCriteria: jest.Mock; contactCandidate: jest.Mock; listForRole: jest.Mock };
  let controller: JobMatchController;
  const req = { userEmail: 'lead@example.com' } as never;

  beforeEach(() => {
    service = {
      listForRole: jest.fn(),
      updateCriteria: jest.fn().mockResolvedValue({ criteria: [] }),
      contactCandidate: jest.fn().mockResolvedValue({ contactedAt: '2026-10-13T12:00:00.000Z' }),
    };
    controller = new JobMatchController(service as unknown as JobMatchService);
  });

  describe('PUT :roleUid/match-criteria', () => {
    it.each([[{ disabled: 'Rust' }], [{}], [{ disabled: [1] }], [null]])(
      'answers 400 for %p without calling the service',
      async (body) => {
        await expect(controller.updateMatchCriteria('role-1', body, req)).rejects.toBeInstanceOf(BadRequestException);
        expect(service.updateCriteria).not.toHaveBeenCalled();
      }
    );

    it('passes a valid body to the service', async () => {
      await controller.updateMatchCriteria('role-1', { disabled: ['Rust'] }, req);
      expect(service.updateCriteria).toHaveBeenCalledWith('role-1', ['Rust'], 'lead@example.com');
    });
  });

  describe('POST :roleUid/suggested-candidates/:memberUid/contact', () => {
    it.each([[{ message: '   ' }], [{ message: 'a'.repeat(2001) }], [{}], [{ message: 5 }]])(
      'answers 400 for an invalid message without calling the service',
      async (body) => {
        await expect(controller.contactCandidate('role-1', 'cand-1', body, req)).rejects.toBeInstanceOf(
          BadRequestException
        );
        expect(service.contactCandidate).not.toHaveBeenCalled();
      }
    );

    it('passes the trimmed message to the service', async () => {
      await expect(controller.contactCandidate('role-1', 'cand-1', { message: '  Hi there ' }, req)).resolves.toEqual({
        contactedAt: '2026-10-13T12:00:00.000Z',
      });
      expect(service.contactCandidate).toHaveBeenCalledWith('role-1', 'cand-1', 'Hi there', 'lead@example.com');
    });
  });
});
