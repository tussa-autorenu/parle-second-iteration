import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.vehicle.upsert({
    where: { id: "derby-01" },
    update: {},
    create: {
      id: "derby-01",
      teslaVehicleId: "1234567890",
      vin: "5YJYGDEE0LF000001",
      friendlyName: "Derby-01"
    }
  });

  await prisma.telemetrySnapshot.create({
    data: {
      vehicleId: "derby-01",
      batteryPercent: 82,
      onlineStatus: "ASLEEP",
      lockStatus: "LOCKED",
      lastLat: 38.2527,
      lastLng: -85.7585,
      source: "seed"
    }
  });

  console.log("Seeded derby-01 vehicle and telemetry snapshot.");
}

main().finally(async () => prisma.$disconnect());
