-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AnalysisKind" AS ENUM ('SCAN', 'PROFILE', 'DIFF');

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "contractId" TEXT,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT,
    "gitRef" TEXT,
    "ecosystem" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "kind" "AnalysisKind" NOT NULL DEFAULT 'SCAN',
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "queueJobId" TEXT,
    "payload" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "jobId" TEXT,
    "kind" "AnalysisKind" NOT NULL DEFAULT 'SCAN',
    "status" "AnalysisStatus" NOT NULL DEFAULT 'COMPLETED',
    "coreVersion" TEXT,
    "source" TEXT,
    "functionCount" INTEGER,
    "storageReads" INTEGER,
    "storageWrites" INTEGER,
    "detectorFindings" INTEGER,
    "transactionCount" INTEGER,
    "distinctKeys" INTEGER,
    "stageCount" INTEGER,
    "parallelism" DOUBLE PRECISION,
    "criticalPathLength" INTEGER,
    "weightedCriticalPathWeight" INTEGER,
    "totalConflicts" INTEGER,
    "rawReport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectorFinding" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "detector" TEXT NOT NULL,
    "function" TEXT,
    "key" TEXT,
    "message" TEXT NOT NULL,

    CONSTRAINT "DetectorFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotKey" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "reads" INTEGER NOT NULL DEFAULT 0,
    "writes" INTEGER NOT NULL DEFAULT 0,
    "touchCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HotKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "letter" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeHistory" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "analysisId" TEXT,
    "letter" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "gitRef" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GradeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "ecosystem" TEXT,
    "letter" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "detectorFindings" INTEGER NOT NULL DEFAULT 0,
    "totalConflicts" INTEGER NOT NULL DEFAULT 0,
    "parallelism" DOUBLE PRECISION,
    "rank" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractId_key" ON "Contract"("contractId");

-- CreateIndex
CREATE INDEX "Contract_ecosystem_idx" ON "Contract"("ecosystem");

-- CreateIndex
CREATE INDEX "Contract_name_idx" ON "Contract"("name");

-- CreateIndex
CREATE INDEX "AnalysisJob_contractId_idx" ON "AnalysisJob"("contractId");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_idx" ON "AnalysisJob"("status");

-- CreateIndex
CREATE INDEX "AnalysisJob_kind_status_idx" ON "AnalysisJob"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_jobId_key" ON "Analysis"("jobId");

-- CreateIndex
CREATE INDEX "Analysis_contractId_idx" ON "Analysis"("contractId");

-- CreateIndex
CREATE INDEX "Analysis_kind_idx" ON "Analysis"("kind");

-- CreateIndex
CREATE INDEX "Analysis_createdAt_idx" ON "Analysis"("createdAt");

-- CreateIndex
CREATE INDEX "DetectorFinding_analysisId_idx" ON "DetectorFinding"("analysisId");

-- CreateIndex
CREATE INDEX "DetectorFinding_detector_idx" ON "DetectorFinding"("detector");

-- CreateIndex
CREATE INDEX "HotKey_analysisId_idx" ON "HotKey"("analysisId");

-- CreateIndex
CREATE INDEX "HotKey_touchCount_idx" ON "HotKey"("touchCount");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_analysisId_key" ON "Grade"("analysisId");

-- CreateIndex
CREATE INDEX "Grade_contractId_idx" ON "Grade"("contractId");

-- CreateIndex
CREATE INDEX "Grade_score_idx" ON "Grade"("score");

-- CreateIndex
CREATE INDEX "GradeHistory_contractId_recordedAt_idx" ON "GradeHistory"("contractId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_contractId_key" ON "LeaderboardEntry"("contractId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_ecosystem_score_idx" ON "LeaderboardEntry"("ecosystem", "score");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_rank_idx" ON "LeaderboardEntry"("rank");

-- AddForeignKey
ALTER TABLE "AnalysisJob" ADD CONSTRAINT "AnalysisJob_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AnalysisJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectorFinding" ADD CONSTRAINT "DetectorFinding_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotKey" ADD CONSTRAINT "HotKey_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeHistory" ADD CONSTRAINT "GradeHistory_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

