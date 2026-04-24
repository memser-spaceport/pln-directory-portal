-- CreateIndex
CREATE INDEX "JobOpening_roleCategory_idx"
  ON "JobOpening" ("roleCategory");

-- CreateIndex
CREATE INDEX "JobOpening_seniority_idx"
  ON "JobOpening" ("seniority");

-- CreateIndex
CREATE INDEX "JobOpening_dwCompanyId_idx"
  ON "JobOpening" ("dwCompanyId");
