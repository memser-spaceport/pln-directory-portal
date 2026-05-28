import { BadRequestException } from '@nestjs/common';
import { RoadmapStage } from '@prisma/client';
import { assertTransitionAllowed, isIdeaStage, isPromoteTransition } from './roadmap-stage.util';

describe('roadmap-stage.util', () => {
  describe('isIdeaStage', () => {
    it('returns true for IDEA and UNDER_REVIEW', () => {
      expect(isIdeaStage(RoadmapStage.IDEA)).toBe(true);
      expect(isIdeaStage(RoadmapStage.UNDER_REVIEW)).toBe(true);
    });

    it('returns false for roadmap stages', () => {
      expect(isIdeaStage(RoadmapStage.PLANNED)).toBe(false);
    });
  });

  describe('assertTransitionAllowed', () => {
    it('allows IDEA to PLANNED', () => {
      expect(() => assertTransitionAllowed(RoadmapStage.IDEA, RoadmapStage.PLANNED)).not.toThrow();
    });

    it('allows SHIPPED to IN_PROGRESS', () => {
      expect(() => assertTransitionAllowed(RoadmapStage.SHIPPED, RoadmapStage.IN_PROGRESS)).not.toThrow();
    });

    it('rejects SHIPPED to PLANNED', () => {
      expect(() => assertTransitionAllowed(RoadmapStage.SHIPPED, RoadmapStage.PLANNED)).toThrow(BadRequestException);
    });

    it('allows DECLINED to IDEA', () => {
      expect(() => assertTransitionAllowed(RoadmapStage.DECLINED, RoadmapStage.IDEA)).not.toThrow();
    });
  });

  describe('isPromoteTransition', () => {
    it('detects promote from idea stage to PLANNED', () => {
      expect(isPromoteTransition(RoadmapStage.UNDER_REVIEW, RoadmapStage.PLANNED)).toBe(true);
      expect(isPromoteTransition(RoadmapStage.PLANNED, RoadmapStage.IN_PROGRESS)).toBe(false);
    });
  });
});
