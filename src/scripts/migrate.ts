import databaseService from '../services/database';
import logger from '../utils/logger';

async function migrate() {
  try {
    logger.info('🔄 Starting database migration...');
    
    // Connect to database
    await databaseService.connect();
    logger.info('✅ Connected to database');
    
    // Run the migration method that removes UNIQUE constraints
    await databaseService.migrate();
    logger.info('✅ Migration completed successfully');
    
    // Initialize tables (this will create new tables with correct schema)
    await databaseService.initializeTables();
    logger.info('✅ Tables created successfully');
    
    logger.info('🎉 Database migration completed successfully!');
  } catch (error) {
    logger.error('❌ Migration failed', { error });
    process.exit(1);
  } finally {
    await databaseService.close();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate();
}

export default migrate; 