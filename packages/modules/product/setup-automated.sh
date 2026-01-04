#!/bin/bash
# Product Management Module - Automated Setup (Non-Interactive)
# This script runs only the automated parts that don't require user interaction

set -e

echo "========================================="
echo "Product Management Module - Automated Setup"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Must be run from packages/modules/product/"
  exit 1
fi

# Step 1: Environment setup
echo "Step 1: Checking environment configuration..."
if [ ! -f "../../.env" ]; then
  echo "⚠️  .env file not found. Creating template..."
  cat > ../../.env <<EOF
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=czo_dev
DB_USER=czo_user
DB_PASSWORD=your_password_here

# Application
NODE_ENV=development
EOF
  echo "✅ .env template created - Please update DB_PASSWORD"
  echo "⚠️  You still need to create the PostgreSQL database manually"
else
  echo "✅ .env file exists"
fi

# Step 2: Check if PostgreSQL is accessible
echo ""
echo "Step 2: Checking PostgreSQL connection..."
if command -v psql &> /dev/null; then
  # Load environment variables
  if [ -f "../../.env" ]; then
    export $(cat ../../.env | grep -v '^#' | xargs)
  fi
  
  # Try to connect
  if psql -h ${DB_HOST:-localhost} -U ${DB_USER:-czo_user} -d ${DB_NAME:-czo_dev} -c "SELECT 1" &> /dev/null; then
    echo "✅ PostgreSQL connection successful"
    
    # Step 3: Run migrations
    echo ""
    echo "Step 3: Running database migrations..."
    pnpm migrate:latest
    echo "✅ Migrations completed"
    
    # Step 4: Generate Kysely types
    echo ""
    echo "Step 4: Generating Kysely types from database..."
    pnpm generate:types
    echo "✅ Kysely types generated"
  else
    echo "⚠️  Cannot connect to PostgreSQL"
    echo "Please ensure:"
    echo "  1. PostgreSQL is running"
    echo "  2. Database 'czo_dev' exists"
    echo "  3. User 'czo_user' has access"
    echo "  4. Password in .env is correct"
    exit 1
  fi
else
  echo "⚠️  psql command not found - skipping database steps"
  echo "Install PostgreSQL client or run migrations manually"
fi

# Step 5: Generate GraphQL types
echo ""
echo "Step 5: Generating GraphQL types from schemas..."
if pnpm generate; then
  echo "✅ GraphQL types generated"
else
  echo "⚠️  GraphQL type generation failed (this is normal if types.ts doesn't exist yet)"
fi

# Step 6: Build check
echo ""
echo "Step 6: Checking build..."
if pnpm build; then
  echo "✅ Build successful"
else
  echo "⚠️  Build failed (may need type generation)"
fi

echo ""
echo "========================================="
echo "Setup Status"
echo "========================================="
echo ""
echo "✅ Configuration files ready"
echo "✅ Migration files created"
if [ -f "src/database/types.ts" ] && [ $(wc -l < src/database/types.ts) -gt 10 ]; then
  echo "✅ Database types generated"
else
  echo "⚠️  Database types not generated yet"
fi

if [ -f "src/schema/types.generated.ts" ]; then
  echo "✅ GraphQL types generated"
else
  echo "⚠️  GraphQL types not generated yet"
fi

echo ""
echo "Next steps:"
echo "  - Review .env file and update passwords"
echo "  - Ensure PostgreSQL database is created"
echo "  - Run 'pnpm test' to verify everything works"
echo "  - Run 'pnpm dev' to start development mode"
echo ""

