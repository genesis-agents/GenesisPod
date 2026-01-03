-- Add new enum values to SlidesMemberRole
-- Note: PostgreSQL doesn't allow removing enum values, so DESIGNER is kept for backwards compatibility
-- but should not be used in new code

-- Add STRATEGIST value
ALTER TYPE "SlidesMemberRole" ADD VALUE IF NOT EXISTS 'STRATEGIST';

-- Add WRITER value
ALTER TYPE "SlidesMemberRole" ADD VALUE IF NOT EXISTS 'WRITER';

-- Note: DESIGNER is kept for backwards compatibility with existing data
-- New code should use STRATEGIST or WRITER instead
