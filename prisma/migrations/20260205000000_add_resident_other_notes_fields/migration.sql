-- Add new *_other_notes fields from updated_resident_fields.json schema

-- Medications / Treatments
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "medications_treatments_treatment_orders_other_notes" TEXT;

-- Behavioral / Safety Risks
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_behavioral_concerns_other_notes" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_known_triggers_other_notes" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "behavioral_safety_risks_de_escalation_other_notes" TEXT;

-- Diet / Nutrition
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_nutrition_prescribed_diet_other_notes" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_nutrition_fluid_restrictions_other_notes" TEXT;
ALTER TABLE "residents" ADD COLUMN IF NOT EXISTS "diet_nutrition_food_allergies_other_notes" TEXT;
