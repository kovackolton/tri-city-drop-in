-- Commit the enum addition separately before the following migration uses it.
ALTER TYPE "PaymentStatus" ADD VALUE 'PAID';
