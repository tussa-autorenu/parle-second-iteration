/**
 * Shared mock vehicle data, used by both the vehicle-selection screen and
 * the enable-access screen. In a real app this would come from the Tesla
 * API after OAuth.
 */

export type Vehicle = {
  id: string;
  year: string;
  model: string;
  vin: string;
  /** 1:1 thumbnail used on screens 2 and 3 (rendered with mix-blend-multiply). */
  image: string;
  /** Optional CSS scale factor — only needed when source crops differ in aspect. */
  imageScale?: number;
};

export const VEHICLES: readonly Vehicle[] = [
  {
    id: "1",
    year: "2024",
    model: "Tesla Model Y",
    vin: "5YJ3E1EA8...NF123",
    image: "/assets/vehicle_white_thumbnail@2x.png",
  },
  {
    id: "2",
    year: "2023",
    model: "Tesla Model 3",
    vin: "5YJ3E1EB2...MK456",
    image: "/assets/vehicle_red_thumbnail@2x.png",
  },
  {
    id: "3",
    year: "2025",
    model: "Tesla Model S",
    vin: "5YJSA1E42...PL789",
    image: "/assets/vehicle_black_thumbnail@2x.png",
  },
];
