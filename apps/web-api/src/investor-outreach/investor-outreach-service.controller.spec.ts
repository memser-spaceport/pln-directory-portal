import { BadRequestException } from '@nestjs/common';
import { InvestorOutreachServiceController } from './investor-outreach-service.controller';
import { InvestorOutreachService } from './investor-outreach.service';

describe('InvestorOutreachServiceController', () => {
  let controller: InvestorOutreachServiceController;
  const ingest = jest.fn();

  beforeEach(() => {
    ingest.mockResolvedValue({
      received: 1,
      ingested: 1,
      created: 1,
      updated: 0,
      failed: 0,
      errors: [],
    });
    controller = new InvestorOutreachServiceController({ ingest } as unknown as InvestorOutreachService);
  });

  it('rejects empty items', async () => {
    await expect(controller.ingest({ items: [] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects missing required field', async () => {
    await expect(
      controller.ingest({
        items: [
          {
            investor_id: 'INV-1',
            dedupe_key: 'a@b.com',
            source: 'Manual',
            email: 'a@b.com',
            email_status: 'verified',
            investor_type: 'fund',
            stage_focus: 'seed',
            engagement_tier: 'T4_cold',
          } as never,
        ],
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates to service', async () => {
    const body = {
      items: [
        {
          investor_id: 'INV-1',
          dedupe_key: 'a@b.com',
          source: 'Manual',
          email: 'a@b.com',
          email_status: 'verified',
          investor_type: 'fund',
          stage_focus: 'seed',
          engagement_tier: 'T4_cold',
          enrichment_status: 'pending',
        },
      ],
    };
    const out = await controller.ingest(body);
    expect(ingest).toHaveBeenCalledWith(body);
    expect(out.created).toBe(1);
  });
});
