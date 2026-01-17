/*
  # Create contact inquiries table

  1. New Tables
    - `contact_inquiries`
      - `id` (uuid, primary key) - Unique identifier for each inquiry
      - `full_name` (text) - Full name of the person contacting
      - `email` (text) - Email address of the person contacting
      - `message` (text) - Description of what they want to contact us about
      - `status` (text) - Status of the inquiry (new, in_progress, resolved)
      - `created_at` (timestamptz) - When the inquiry was submitted
      - `updated_at` (timestamptz) - When the inquiry was last updated

  2. Security
    - Enable RLS on `contact_inquiries` table
    - Add policy for anyone to create inquiries (public form submission)
    - No public read access - only authenticated admins should view inquiries
*/

CREATE TABLE IF NOT EXISTS contact_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  message text NOT NULL,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow anyone to submit a contact inquiry (public form)
CREATE POLICY "Anyone can submit contact inquiry"
  ON contact_inquiries
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Only authenticated users can view inquiries (for admin purposes)
CREATE POLICY "Authenticated users can view inquiries"
  ON contact_inquiries
  FOR SELECT
  TO authenticated
  USING (true);