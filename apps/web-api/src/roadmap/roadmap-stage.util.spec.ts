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
    it('allows any stage to move to any other stage', () => {
      const stages = Object.values(RoadmapStage);
      for (const from of stages) {
        for (const to of stages) {
          expect(() => assertTransitionAllowed(from, to)).not.toThrow();
        }
      }
    });
  });

  describe('isPromoteTransition', () => {
    it('detects promote from idea stage to PLANNED', () => {
      expect(isPromoteTransition(RoadmapStage.UNDER_REVIEW, RoadmapStage.PLANNED)).toBe(true);
      expect(isPromoteTransition(RoadmapStage.PLANNED, RoadmapStage.IN_PROGRESS)).toBe(false);
    });
  });
});
