/*
  # Create campaign_results table

  1. New Tables
    - `campaign_results`
      - `id` (uuid, primary key)
      - `campaign_id` (uuid, foreign key to campaigns)
      - `url` (text) - The business website URL
      - `industry` (text) - The business industry
      - `strategic_brief` (text) - Strategic brief content
      - `social_media_posts` (jsonb) - Array of social media posts
      - `email_sequence` (jsonb) - Array of email content
      - `blog_article` (text) - Blog article content
      - `ad_copy` (jsonb) - Array of ad variations
      - `video_scripts` (jsonb) - Array of video scripts
      - `generated_images` (jsonb) - Array of image URLs
      - `status` (text) - Status: analyzing, complete, failed
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `campaign_results` table
    - Add policy for authenticated users to read their own campaign results
    - Add policy for authenticated users to create campaign results
    - Add policy for authenticated users to update their own campaign results
*/

CREATE TABLE IF NOT EXISTS campaign_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  url text NOT NULL,
  industry text NOT NULL,
  strategic_brief text,
  social_media_posts jsonb DEFAULT '[]'::jsonb,
  email_sequence jsonb DEFAULT '[]'::jsonb,
  blog_article text,
  ad_copy jsonb DEFAULT '[]'::jsonb,
  video_scripts jsonb DEFAULT '[]'::jsonb,
  generated_images jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'analyzing',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE campaign_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own campaign results"
  ON campaign_results
  FOR SELECT
  TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE id = campaign_results.campaign_id
    )
  );

CREATE POLICY "Users can create campaign results"
  ON campaign_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE id = campaign_results.campaign_id
    )
  );

CREATE POLICY "Users can update own campaign results"
  ON campaign_results
  FOR UPDATE
  TO authenticated
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE id = campaign_results.campaign_id
    )
  )
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE id = campaign_results.campaign_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_campaign_results_campaign_id ON campaign_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_results_status ON campaign_results(status);
