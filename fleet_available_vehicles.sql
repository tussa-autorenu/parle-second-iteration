CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.fleet_available_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  source_vehicle_id text,
  vin text,
  display_name text,
  model text,
  color text,
  battery_level integer CHECK (
    battery_level IS NULL OR (battery_level >= 0 AND battery_level <= 100)
  ),
  range_miles integer,
  is_locked boolean,
  hourly_rate numeric(10, 2) DEFAULT 0,
  distance_miles numeric(6, 2),
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fleet_available_vehicles_available_idx
ON public.fleet_available_vehicles (is_available, created_at DESC);

CREATE INDEX IF NOT EXISTS fleet_available_vehicles_owner_idx
ON public.fleet_available_vehicles (owner_user_id);

CREATE INDEX IF NOT EXISTS fleet_available_vehicles_source_vehicle_idx
ON public.fleet_available_vehicles (source_vehicle_id);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_available_vehicles_source_vehicle_unique_idx
ON public.fleet_available_vehicles (source_vehicle_id)
WHERE source_vehicle_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_fleet_available_vehicles_updated_at
ON public.fleet_available_vehicles;

CREATE TRIGGER set_fleet_available_vehicles_updated_at
BEFORE UPDATE ON public.fleet_available_vehicles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fleet_available_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read available fleet vehicles"
ON public.fleet_available_vehicles;

CREATE POLICY "Authenticated users can read available fleet vehicles"
ON public.fleet_available_vehicles
FOR SELECT
TO authenticated
USING (is_available = true);

-- Owners must be able to read EVERY vehicle they own, including ones that are
-- not currently published (is_available = false). RLS SELECT policies are
-- OR-combined, so this widens visibility only for the row's owner and does not
-- expose anyone else's unavailable vehicles. Without this policy the renter app
-- silently receives zero owned rows for unpublished vehicles.
DROP POLICY IF EXISTS "Owners can read their own fleet vehicles"
ON public.fleet_available_vehicles;

CREATE POLICY "Owners can read their own fleet vehicles"
ON public.fleet_available_vehicles
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can insert their own fleet vehicles"
ON public.fleet_available_vehicles;

CREATE POLICY "Owners can insert their own fleet vehicles"
ON public.fleet_available_vehicles
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update their own fleet vehicles"
ON public.fleet_available_vehicles;

CREATE POLICY "Owners can update their own fleet vehicles"
ON public.fleet_available_vehicles
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can delete their own fleet vehicles"
ON public.fleet_available_vehicles;

CREATE POLICY "Owners can delete their own fleet vehicles"
ON public.fleet_available_vehicles
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());
