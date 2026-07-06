// `pnpm --filter @opencreate/api db:migrate` entry (plan Task 4). Because the
// bootstrap DDL is idempotent and runs inside createDb(), "migrating" is just
// opening the database once with the configured path.
import { loadConfig } from '../config'
import { createDb } from './client'

createDb(loadConfig().databasePath)
console.log('db ready')
