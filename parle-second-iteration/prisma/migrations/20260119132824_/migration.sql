-- CreateEnum
CREATE TYPE "OnlineStatus" AS ENUM ('AWAKE', 'ASLEEP', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LockStatus" AS ENUM ('LOCKED', 'UNLOCKED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CommandType" AS ENUM ('WAKE', 'UNLOCK', 'ENABLE_DRIVE', 'LOCK', 'HONK', 'FLASH', 'PRECONDITION_ON', 'SEND_DESTINATION', 'READY_VEHICLE');

-- CreateEnum
CREATE TYPE "CommandResult" AS ENUM ('SUCCESS', 'FAIL');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" VARCHAR(64) NOT NULL,
    "teslaVehicleId" VARCHAR(64) NOT NULL,
    "vin" VARCHAR(64) NOT NULL,
    "friendlyName" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetrySnapshot" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "batteryPercent" INTEGER,
    "onlineStatus" "OnlineStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lockStatus" "LockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'tesla',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetrySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandLog" (
    "id" TEXT NOT NULL,
    "requestId" VARCHAR(128) NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "command" "CommandType" NOT NULL,
    "triggeredBy" VARCHAR(128) NOT NULL,
    "result" "CommandResult" NOT NULL,
    "errorReason" VARCHAR(64),
    "errorMessage" VARCHAR(512),
    "teslaStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_teslaVehicleId_idx" ON "Vehicle"("teslaVehicleId");

-- CreateIndex
CREATE INDEX "Vehicle_vin_idx" ON "Vehicle"("vin");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot_vehicleId_lastSeenAt_idx" ON "TelemetrySnapshot"("vehicleId", "lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "CommandLog_vehicleId_createdAt_idx" ON "CommandLog"("vehicleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CommandLog_triggeredBy_createdAt_idx" ON "CommandLog"("triggeredBy", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CommandLog_vehicleId_requestId_command_key" ON "CommandLog"("vehicleId", "requestId", "command");

-- AddForeignKey
ALTER TABLE "TelemetrySnapshot" ADD CONSTRAINT "TelemetrySnapshot_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandLog" ADD CONSTRAINT "CommandLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
