/*
  # Add Brand Context Fields to Campaign Results

  1. Changes
    - Add `brand_json` (jsonb) - Stores extracted brand data in JSON format
    - Add `brand_extracted_images` (jsonb) - Array of extracted brand image URLs
    - Add `brand_guidelines` (text) - Markdown-formatted brand guidelines including colors, fonts, voice

  2. Purpose
    - Allows users to edit and correct brand extraction data
    - Stores customized brand context separately from original extraction
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_results' AND column_name = 'brand_json'
  ) THEN
    ALTER TABLE campaign_results ADD COLUMN brand_json jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_results' AND column_name = 'brand_extracted_images'
  ) THEN
    ALTER TABLE campaign_results ADD COLUMN brand_extracted_images jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaign_results' AND column_name = 'brand_guidelines'
  ) THEN
    ALTER TABLE campaign_results ADD COLUMN brand_guidelines text;
  END IF;
END $$;
