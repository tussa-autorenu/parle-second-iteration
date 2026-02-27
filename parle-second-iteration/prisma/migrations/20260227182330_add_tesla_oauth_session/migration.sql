-- CreateTable
CREATE TABLE "TeslaOAuthSession" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeslaOAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TeslaOAuthSession_state_key" ON "TeslaOAuthSession"("state");
