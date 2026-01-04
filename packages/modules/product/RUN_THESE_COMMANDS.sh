#!/bin/bash
# Product Management Module - Setup Commands
# Run these commands to complete the implementation setup

set -e

echo "========================================="
echo "Product Management Module - Setup"
echo "========================================="
echo ""

# Step 1: Create database
echo "Step 1: Creating PostgreSQL database..."
echo "Please run manually:"
echo "  psql -U postgres -c \"CREATE DATABASE czo_dev;\""
echo "  psql -U postgres -c \"CREATE USER czo_user WITH PASSWORD 'your_password';\""
echo "  psql -U postgres -c \"GRANT ALL PRIVILEGES ON DATABASE czo_dev TO czo_user;\""
echo ""
read -p "Press Enter after creating the database..."

# Step 2: Environment setup
echo ""
echo "Step 2: Environment configuration..."
if [ ! -f "../../.env" ]; then
  echo "Creating .env file..."
  cat > ../../.env <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=czo_dev
DB_USER=czo_user
DB_PASSWORD=your_password
NODE_ENV=development
EOF
  echo "✅ .env file created"
else
  echo "⚠️  .env file already exists. Please verify it contains the database configuration."
fi

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

# Step 5: Generate GraphQL types
echo ""
echo "Step 5: Generating GraphQL types from schemas..."
pnpm generate
echo "✅ GraphQL types generated"

# Step 6: Run tests
echo ""
echo "Step 6: Running tests..."
pnpm test
echo "✅ Tests completed"

echo ""
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Your product management module is ready to use!"
echo ""
echo "Next steps:"
echo "  - Run 'pnpm dev' to start development mode"
echo "  - Check GraphQL schema in src/schema/"
echo "  - Review README.md for API documentation"
echo ""

