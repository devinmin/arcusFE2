/*
  # Create campaigns table for code-based authentication
  
  1. New Tables
    - `campaigns`
      - `id` (uuid, primary key)
      - `name` (text) - Campaign name
      - `access_code` (text, unique) - Case-sensitive access code
      - `description` (text) - Campaign description
      - `active_campaigns_count` (integer) - Number of active campaigns
      - `content_generated_count` (integer) - Content pieces generated
      - `roi_percentage` (integer) - ROI increase percentage
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
  2. Security
    - Enable RLS on `campaigns` table
    - Add policy for public read access (needed for code verification)
*/

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  access_code text UNIQUE NOT NULL,
  description text DEFAULT '',
  active_campaigns_count integer DEFAULT 0,
  content_generated_count integer DEFAULT 0,
  roi_percentage integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read campaigns"
  ON campaigns
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_campaigns_access_code ON campaigns(access_code);